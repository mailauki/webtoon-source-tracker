"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { addEntrySource } from "@/app/actions/entry-sources";
import { updateProgress } from "@/app/actions/progress";
import { removeEntry, restoreEntry } from "@/app/actions/remove-entry";
import { verifySession } from "@/lib/auth/dal";
import { MAL_LIST_STATUSES } from "@/lib/mal/types";
import { createClient } from "@/lib/supabase/server";

export type BulkEditResult = {
  applied: number[];
  failed: { entryId: number; error: string }[];
  /** Never attempted: the run stopped early on an expired login or a 403. */
  skipped: number[];
};

const opSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status"), status: z.enum(MAL_LIST_STATUSES) }),
  z.object({ kind: z.literal("source"), sourceId: z.number().int().positive() }),
  // The same three targets as the per-title dialog. Only the library one is
  // reversible (it archives), so only it gets an Undo.
  z.object({
    kind: z.literal("remove"),
    fromLibrary: z.boolean(),
    fromMal: z.boolean(),
    fromAniList: z.boolean(),
  }),
  z.object({ kind: z.literal("restore") }),
]);
export type BulkOp = z.infer<typeof opSchema>;

const bulkSchema = z.object({
  entryIds: z.array(z.number().int().positive()).min(1).max(500),
  op: opSchema,
});

/**
 * One edit applied to many titles. See TODO.md, `TODO(bulk-edit)`.
 *
 * One action taking many ids rather than many actions: Next runs a client's
 * Server Actions one at a time anyway. Each title goes through the same
 * single-title action its own UI uses, so every per-title rule (MAL first,
 * ownership checks, archive-not-delete) holds unchanged, and a failure leaves
 * only that title untouched. That makes the result per title: "7 of 10"
 * rather than all-or-nothing.
 */
export async function bulkEdit(
  entryIds: number[],
  op: BulkOp,
): Promise<BulkEditResult> {
  await verifySession();
  const parsed = bulkSchema.parse({ entryIds, op });
  const result: BulkEditResult = { applied: [], failed: [], skipped: [] };

  // Attaching a source a title already has is the intent satisfied, not a
  // failure — so those are counted as applied without an insert that would
  // fail on the unique index.
  let already = new Set<number>();
  if (parsed.op.kind === "source") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("entry_sources")
      .select("entry_id")
      .eq("source_id", parsed.op.sourceId)
      .in("entry_id", parsed.entryIds);
    already = new Set((data ?? []).map((r) => r.entry_id));
  }

  // Which sites each title is on. removeEntry refuses a site a title is not
  // on — right for one title, where the dialog only offers the sites it is
  // on, but in a batch "remove from MyAnimeList" means "wherever it is there".
  const onSites = new Map<number, { mal: boolean; anilist: boolean }>();
  if (parsed.op.kind === "remove" && (parsed.op.fromMal || parsed.op.fromAniList)) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_entries")
      .select("id, media_titles!inner (mal_media_id, anilist_media_id)")
      .in("id", parsed.entryIds);
    for (const row of data ?? []) {
      onSites.set(row.id, {
        mal: row.media_titles.mal_media_id !== null,
        anilist: row.media_titles.anilist_media_id !== null,
      });
    }
  }

  for (const [i, entryId] of parsed.entryIds.entries()) {
    if (already.has(entryId)) {
      result.applied.push(entryId);
      continue;
    }

    const formData = new FormData();
    formData.set("entry_id", String(entryId));
    let error: string | undefined;
    let stop = false;

    switch (parsed.op.kind) {
      case "status": {
        formData.set("list_status", parsed.op.status);
        const out = await updateProgress(null, formData);
        if (!out?.ok) {
          error = out?.error;
          // Every later write would fail the same way, and MAL's client
          // deliberately does not retry a 403.
          stop = !!out && (!!out.needsReauth || !!out.rateLimited);
        }
        break;
      }
      case "source": {
        formData.set("source_id", String(parsed.op.sourceId));
        error = (await addEntrySource(null, formData))?.error;
        break;
      }
      case "remove": {
        const on = onSites.get(entryId);
        const targets = {
          from_library: parsed.op.fromLibrary,
          from_mal: parsed.op.fromMal && !!on?.mal,
          from_anilist: parsed.op.fromAniList && !!on?.anilist,
        };
        // Nothing left to do for this title: it is on none of the chosen
        // sites. The intent is satisfied, as with an already-attached source.
        if (!Object.values(targets).some(Boolean)) break;
        for (const [key, on] of Object.entries(targets)) {
          if (on) formData.set(key, "on");
        }
        const out = await removeEntry(null, formData);
        if (!out?.ok) {
          error = out?.error;
          stop = !!out && (!!out.needsReauth || !!out.rateLimited);
        }
        break;
      }
      case "restore": {
        const out = await restoreEntry(null, formData);
        if (!out?.ok) error = out?.error;
        break;
      }
    }

    if (error === undefined) {
      result.applied.push(entryId);
      continue;
    }
    result.failed.push({ entryId, error: error || "Not saved." });
    if (stop) {
      result.skipped = parsed.entryIds.slice(i + 1);
      break;
    }
  }

  // The single-title actions revalidate /library and each entry page; this
  // covers whichever page the batch was started from (a category or tag).
  refresh();
  return result;
}
