"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { MalClient } from "@/lib/mal/client";
import { getManga, updateListStatus } from "@/lib/mal/endpoints";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { MAL_LIST_STATUSES } from "@/lib/mal/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AddEntryState =
  | { ok: true; message: string; entryId: number }
  | { ok: false; error: string; needsReauth?: boolean }
  | null;

const addSchema = z.object({
  malMediaId: z.coerce.number().int().positive(),
  listStatus: z.enum(MAL_LIST_STATUSES).default("plan_to_read"),
});

/**
 * Adds a MyAnimeList title to the user's list, then mirrors it locally.
 *
 * Same non-negotiable ordering as updateProgress: MAL is the source of truth,
 * so the write goes THERE first. A local-only row would be silently deleted by
 * the next sync — sync-list.ts removes entries MAL doesn't know about — so a
 * failed MAL write must leave nothing behind locally.
 *
 * The catalog row is upserted with the admin client because `media_titles` is
 * a shared catalog owned by nobody; the user's own `user_entries` row goes
 * through the RLS-scoped client, which is what ties it to them.
 */
export async function addEntry(
  _prev: AddEntryState,
  formData: FormData,
): Promise<AddEntryState> {
  const { userId } = await verifySession();

  const parsed = addSchema.safeParse({
    malMediaId: formData.get("mal_media_id"),
    listStatus: formData.get("list_status") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "That title couldn't be added." };
  }

  const { malMediaId, listStatus } = parsed.data;

  // --- MAL first -----------------------------------------------------------
  // Re-fetch the node rather than trusting the client's posted fields: this is
  // an untrusted entry point, and the catalog row must reflect MAL, not a
  // payload someone hand-crafted.
  let node;
  let echoed;
  try {
    const client = new MalClient(userId);
    node = await getManga(client, malMediaId);
    echoed = await updateListStatus(client, malMediaId, { status: listStatus });
  } catch (cause) {
    if (cause instanceof MalAuthError) {
      revalidatePath("/library");
      return {
        ok: false,
        needsReauth: true,
        error: "Your MyAnimeList connection expired. Please reconnect.",
      };
    }
    if (cause instanceof MalRateLimitError) {
      return {
        ok: false,
        error: "MyAnimeList is rate limiting us. Try again shortly.",
      };
    }
    // Nothing written locally — the cache stays behind MAL, never ahead.
    return {
      ok: false,
      error: `MyAnimeList rejected the add: ${(cause as Error).message}`,
    };
  }

  // --- then mirror it ------------------------------------------------------
  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data: title, error: catalogError } = await admin
    .from("media_titles")
    .upsert(
      {
        media_type: "manga",
        mal_media_id: node.id,
        title: node.title,
        title_en: node.alternative_titles?.en || null,
        main_picture_url:
          node.main_picture?.large ?? node.main_picture?.medium ?? null,
        mal_media_kind: node.media_type ?? null,
        num_chapters: node.num_chapters ?? null,
        num_volumes: node.num_volumes ?? null,
        mal_status: node.status ?? null,
        synced_at: now,
      },
      { onConflict: "media_type,mal_media_id" },
    )
    .select("id")
    .single();

  if (catalogError || !title) {
    return {
      ok: false,
      error: "Added to MyAnimeList, but the local copy didn't save. Sync to catch up.",
    };
  }

  const supabase = await createClient();
  const { data: entry, error: entryError } = await supabase
    .from("user_entries")
    .upsert(
      {
        user_id: userId,
        title_id: title.id,
        list_status: echoed.status,
        num_chapters_read: echoed.num_chapters_read,
        num_volumes_read: echoed.num_volumes_read,
        score: echoed.score,
        is_rereading: echoed.is_rereading,
        mal_updated_at: echoed.updated_at ?? now,
        synced_at: now,
      },
      { onConflict: "user_id,title_id" },
    )
    .select("id")
    .single();

  if (entryError || !entry) {
    // MAL succeeded, so the user's data is safe; only our cache is stale.
    return {
      ok: false,
      error: "Added to MyAnimeList, but the local copy didn't save. Sync to catch up.",
    };
  }

  revalidatePath("/library");

  return {
    ok: true,
    entryId: entry.id,
    message: `Added ${node.title} to your list.`,
  };
}
