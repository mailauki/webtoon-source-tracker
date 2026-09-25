import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { describeMirror, mirrorToAniList } from "@/lib/anilist/mirror";
import { MalClient } from "@/lib/mal/client";
import { updateListStatus } from "@/lib/mal/endpoints";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { MAL_LIST_STATUSES } from "@/lib/mal/types";
import type { Database } from "@/lib/supabase/types";

/*
 * The progress save, shared by the web's server action
 * (app/actions/progress.ts) and the iOS app's endpoint
 * (app/api/entries/[id]/progress). Each authenticates its own way and passes
 * a Supabase client acting as that user, so RLS scopes every query here. It
 * lives outside the actions file because everything a "use server" module
 * exports becomes a client-callable action.
 */

export type ProgressState =
  | { ok: true; message: string }
  | { ok: false; error: string; needsReauth?: boolean; rateLimited?: boolean }
  | null;

export const patchSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  numChaptersRead: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(10_000)])
    .optional(),
  listStatus: z.enum(MAL_LIST_STATUSES).optional(),
  score: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(10)])
    .optional(),
  /**
   * The chapter count the editor was counting up to — higher than the stored
   * one when AniList is ahead of MyAnimeList. Only ever raises the completion
   * threshold below (it is maxed with the stored count), so a forged value can
   * delay an auto-complete on the sender's own entry, never cause one.
   */
  total: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
});

export type ProgressInput = z.infer<typeof patchSchema>;

/**
 * Updates progress on MyAnimeList, then mirrors the result locally.
 *
 * Order matters and is not negotiable: MAL is the source of truth, so the
 * write goes there FIRST. If it fails, nothing is written locally — the cache
 * must never be ahead of MAL. On success we store MAL's *echoed* values rather
 * than what we sent, because MAL clamps (e.g. chapters capped at num_chapters).
 */
export async function saveProgress(
  supabase: SupabaseClient<Database>,
  userId: string,
  { entryId, numChaptersRead, listStatus, score, total }: ProgressInput,
): Promise<ProgressState> {

  // Load the entry and assert ownership explicitly. RLS already scopes this
  // query, but the update below runs against a specific id — an explicit check
  // keeps that safe even if this ever moves to an admin client.
  const { data: entry, error: loadError } = await supabase
    .from("user_entries")
    .select(
      "id, user_id, num_chapters_read, sync_to_mal, sync_to_anilist, media_titles!inner (id, mal_media_id, anilist_media_id, num_chapters)",
    )
    .eq("id", entryId)
    .maybeSingle();

  if (loadError || !entry) {
    return { ok: false, error: "That title isn't in your library." };
  }
  if (entry.user_id !== userId) {
    return { ok: false, error: "That title isn't in your library." };
  }

  const malMediaId = entry.media_titles.mal_media_id;
  const totalChapters = Math.max(
    entry.media_titles.num_chapters ?? 0,
    total || 0,
  );

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

  // --- AniList-only titles never touch MyAnimeList --------------------------
  //
  // A title MAL does not have cannot be written there, so the MAL-first rule
  // below has nothing to apply to. These entries mirror AniList instead, and
  // the mirror is the ONLY remote write — so unlike the MAL path it is not
  // best-effort: if it fails, the local copy must not move either, or the app
  // would show progress that exists nowhere else.
  if (malMediaId === null) {
    // Excluded from AniList, and AniList is the only place this title exists.
    // There is nowhere to write it, so the edit is refused rather than saved
    // locally — a local-only change would be invisible to every sync and
    // would look like the app had silently lost it.
    if (!entry.sync_to_anilist) {
      return {
        ok: false,
        error:
          "This title is set not to sync to AniList, and AniList is the only site that has it. Turn syncing back on to record progress.",
      };
    }

    const outcome = await mirrorToAniList(userId, entry.media_titles, {
      status: patch.status ?? "reading",
      num_chapters_read: patch.num_chapters_read ?? entry.num_chapters_read,
      num_volumes_read: 0,
      score: patch.score ?? 0,
      is_rereading: false,
    });

    if (outcome !== "saved") {
      return {
        ok: false,
        needsReauth: outcome === "needs_reauth",
        error:
          outcome === "needs_reauth"
            ? "Your AniList connection expired. Please reconnect."
            : "AniList wouldn't accept that change. Try again.",
      };
    }

    const { error: anilistWriteError } = await supabase
      .from("user_entries")
      .update({
        ...(patch.status ? { list_status: patch.status } : {}),
        ...(patch.num_chapters_read !== undefined
          ? { num_chapters_read: patch.num_chapters_read }
          : {}),
        ...(patch.score !== undefined ? { score: patch.score } : {}),
        // The MAL path below stores what MyAnimeList echoed back; AniList's
        // mutation returns no timestamp, so the edit's own time is the honest
        // value. Without it the row would keep its old position under the
        // library's "recently updated" sort despite having just changed.
        mal_updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      })
      .eq("id", entryId);

    if (anilistWriteError) {
      return {
        ok: false,
        error: "Saved to AniList, but the local copy didn't refresh. Sync to catch up.",
      };
    }

    revalidatePath(`/entry/${entryId}`);
    revalidatePath("/library");
    return { ok: true, message: "Saved to AniList." };
  }

  // --- MAL first, unless this title is excluded from it ---------------------
  //
  // With MyAnimeList excluded there is nothing to write there and nothing to
  // echo back, so the local row becomes the record of this edit. It is written
  // from `patch` rather than from MAL's response — the one case where the
  // local copy is allowed to lead rather than mirror — and then mirrored on to
  // AniList below if that side is still enabled.
  if (!entry.sync_to_mal) {
    const now = new Date().toISOString();
    const { error: localError } = await supabase
      .from("user_entries")
      .update({
        ...(patch.status ? { list_status: patch.status } : {}),
        ...(patch.num_chapters_read !== undefined
          ? { num_chapters_read: patch.num_chapters_read }
          : {}),
        ...(patch.score !== undefined ? { score: patch.score } : {}),
        mal_updated_at: now,
        synced_at: now,
      })
      .eq("id", entryId);

    if (localError) {
      return { ok: false, error: "That change couldn't be saved." };
    }

    // AniList still gets it unless it is excluded too. Best-effort, as on the
    // MAL path: the local row already holds the edit.
    const mirrored = entry.sync_to_anilist
      ? describeMirror(
          await mirrorToAniList(userId, entry.media_titles, {
            status: patch.status ?? "reading",
            num_chapters_read:
              patch.num_chapters_read ?? entry.num_chapters_read,
            num_volumes_read: 0,
            score: patch.score ?? 0,
            is_rereading: false,
          }),
        )
      : null;

    revalidatePath(`/entry/${entryId}`);
    revalidatePath("/library");

    return {
      ok: true,
      message: mirrored
        ? `Saved. Not synced to MyAnimeList. ${mirrored}`
        : "Saved. Not synced to MyAnimeList or AniList.",
    };
  }

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
        rateLimited: true,
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

  // --- then AniList, best-effort -------------------------------------------
  // Only after MAL and the local copy both hold the edit. It never fails the
  // save: see mirrorToAniList for why. Skipped entirely when the user has
  // excluded this title from AniList.
  const mirrored = entry.sync_to_anilist
    ? describeMirror(await mirrorToAniList(userId, entry.media_titles, echoed))
    : null;

  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/library");

  return {
    ok: true,
    message: mirrored ? `Saved to MyAnimeList. ${mirrored}` : "Saved to MyAnimeList.",
  };
}
