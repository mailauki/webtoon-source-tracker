import "server-only";

import type { MalListStatus } from "@/lib/mal/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { AniListClient } from "./client";
import { findMediaByMalIds, saveListEntry } from "./endpoints";
import { AniListAuthError, AniListRateLimitError } from "./errors";
import { toAniListScoreRaw, toAniListStatus } from "./mapping";

export type MirrorOutcome =
  /** No active AniList connection — nothing to do, and nothing to report. */
  | "not_connected"
  | "saved"
  /** AniList has no entry for this MAL title. */
  | "unmatched"
  | "needs_reauth"
  | "failed";

/**
 * Copies a list entry that was just written to MyAnimeList over to AniList.
 *
 * Called *after* the MAL write and the local mirror have both succeeded, and
 * never allowed to fail them: MAL is the source of truth, the user's edit is
 * already safe there, and AniList being briefly behind is exactly what the
 * account sync in Settings exists to repair. So every error is caught and
 * turned into an outcome for the caller's message, never thrown.
 *
 * `state` should be what MAL *echoed*, not what was sent — MAL clamps, and
 * AniList should end up agreeing with MAL rather than with the request.
 */
export async function mirrorToAniList(
  userId: string,
  title: { id: number; mal_media_id: number; anilist_media_id: number | null },
  state: {
    status: MalListStatus;
    num_chapters_read: number;
    num_volumes_read: number;
    score: number;
    is_rereading: boolean;
  },
): Promise<MirrorOutcome> {
  try {
    const admin = createAdminClient();
    const { data: connection } = await admin
      .from("anilist_connections")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!connection) return "not_connected";
    if (connection.status === "needs_reauth") return "needs_reauth";
    if (connection.status !== "active") return "not_connected";

    const client = new AniListClient(userId);

    let mediaId = title.anilist_media_id;
    if (mediaId === null) {
      const found = await findMediaByMalIds(client, [title.mal_media_id]);
      mediaId = found.get(title.mal_media_id) ?? null;
      if (mediaId === null) return "unmatched";

      // Remember it, so the next edit to this title skips the lookup.
      await admin
        .from("media_titles")
        .update({ anilist_media_id: mediaId })
        .eq("id", title.id);
    }

    await saveListEntry(client, {
      mediaId,
      status: toAniListStatus(state.status, state.is_rereading),
      progress: state.num_chapters_read,
      progressVolumes: state.num_volumes_read,
      scoreRaw: toAniListScoreRaw(state.score),
    });

    return "saved";
  } catch (cause) {
    if (cause instanceof AniListAuthError) return "needs_reauth";
    if (!(cause instanceof AniListRateLimitError)) {
      console.error("[anilist/mirror] failed:", cause);
    }
    return "failed";
  }
}

/**
 * The sentence a mirror outcome adds to a "Saved to MyAnimeList" message, or
 * null when there is nothing worth saying.
 */
export function describeMirror(outcome: MirrorOutcome): string | null {
  switch (outcome) {
    case "saved":
      return "AniList updated too.";
    case "unmatched":
      return "AniList has no entry for this title, so it was left alone.";
    case "needs_reauth":
      return "AniList wasn't updated — reconnect it in Settings.";
    case "failed":
      return "AniList didn't update — run Sync accounts in Settings to catch it up.";
    case "not_connected":
      return null;
  }
}
