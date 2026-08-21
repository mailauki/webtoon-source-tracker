"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { MalClient } from "@/lib/mal/client";
import { updateListStatus } from "@/lib/mal/endpoints";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { MAL_LIST_STATUSES } from "@/lib/mal/types";
import { createClient } from "@/lib/supabase/server";

export type ProgressState =
  | { ok: true; message: string }
  | { ok: false; error: string; needsReauth?: boolean }
  | null;

const patchSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  numChaptersRead: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(10_000)])
    .optional(),
  listStatus: z.enum(MAL_LIST_STATUSES).optional(),
  score: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(10)])
    .optional(),
});

/**
 * Updates progress on MyAnimeList, then mirrors the result locally.
 *
 * Order matters and is not negotiable: MAL is the source of truth, so the
 * write goes there FIRST. If it fails, nothing is written locally — the cache
 * must never be ahead of MAL. On success we store MAL's *echoed* values rather
 * than what we sent, because MAL clamps (e.g. chapters capped at num_chapters).
 */
export async function updateProgress(
  _prev: ProgressState,
  formData: FormData,
): Promise<ProgressState> {
  const { userId } = await verifySession();

  const parsed = patchSchema.safeParse({
    entryId: formData.get("entry_id"),
    numChaptersRead: formData.get("num_chapters_read") ?? "",
    listStatus: formData.get("list_status") || undefined,
    score: formData.get("score") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { entryId, numChaptersRead, listStatus, score } = parsed.data;
  const supabase = await createClient();

  // Load the entry and assert ownership explicitly. RLS already scopes this
  // query, but the update below runs against a specific id — an explicit check
  // keeps that safe even if this ever moves to an admin client.
  const { data: entry, error: loadError } = await supabase
    .from("user_entries")
    .select("id, user_id, num_chapters_read, media_titles!inner (mal_media_id, num_chapters)")
    .eq("id", entryId)
    .maybeSingle();

  if (loadError || !entry) {
    return { ok: false, error: "That title isn't in your library." };
  }
  if (entry.user_id !== userId) {
    return { ok: false, error: "That title isn't in your library." };
  }

  const malMediaId = entry.media_titles.mal_media_id;
  const totalChapters = entry.media_titles.num_chapters;

  const patch: {
    num_chapters_read?: number;
    status?: (typeof MAL_LIST_STATUSES)[number];
    score?: number;
  } = {};

  if (numChaptersRead !== "" && numChaptersRead !== undefined) {
    patch.num_chapters_read = numChaptersRead;
  }
  if (listStatus) patch.status = listStatus;
  if (score !== "" && score !== undefined) patch.score = score;

  // Finishing the last chapter almost always means "completed" — send it in
  // the same request rather than making the user set it separately.
  if (
    patch.num_chapters_read !== undefined &&
    totalChapters &&
    totalChapters > 0 &&
    patch.num_chapters_read >= totalChapters &&
    !patch.status
  ) {
    patch.status = "completed";
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  // --- MAL first -----------------------------------------------------------
  let echoed;
  try {
    const client = new MalClient(userId);
    echoed = await updateListStatus(client, malMediaId, patch);
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
      error: `MyAnimeList rejected the update: ${(cause as Error).message}`,
    };
  }

  // --- then mirror MAL's response -----------------------------------------
  const { error: writeError } = await supabase
    .from("user_entries")
    .update({
      list_status: echoed.status,
      num_chapters_read: echoed.num_chapters_read,
      num_volumes_read: echoed.num_volumes_read,
      score: echoed.score,
      is_rereading: echoed.is_rereading,
      mal_updated_at: echoed.updated_at ?? new Date().toISOString(),
      synced_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (writeError) {
    // MAL succeeded, so the user's data is safe; only our cache is stale.
    return {
      ok: false,
      error: "Saved to MyAnimeList, but the local copy didn't refresh. Sync to catch up.",
    };
  }

  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/library");

  return { ok: true, message: "Saved to MyAnimeList." };
}
