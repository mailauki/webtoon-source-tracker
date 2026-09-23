"use server";

import { revalidatePath } from "next/cache";

import { AniListAuthError, AniListRateLimitError } from "@/lib/anilist/errors";
import { verifySession } from "@/lib/auth/dal";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { syncAniListList } from "@/lib/sync/sync-anilist";
import { syncMalList, type SyncResult } from "@/lib/sync/sync-list";

export type SyncState =
  | { ok: true; result: SyncResult; message: string }
  | { ok: false; error: string; needsReauth?: boolean }
  | null;

/**
 * Syncs the signed-in user's library from every site they have connected.
 *
 * One action rather than one per site: "sync my library" is the user's whole
 * intent, and making them choose a provider would be asking them to care about
 * a split the app is supposed to hide. Whichever sites are connected are the
 * ones that run; a disconnected site is simply skipped.
 *
 * A server action rather than a route handler: it is user-initiated, needs
 * revalidatePath, and gets CSRF protection for free. The engines live in
 * lib/sync/ so a scheduled job could reuse them later.
 *
 * The two halves are independent on purpose. MyAnimeList failing must not stop
 * the AniList pull — they answer for different titles, and an outage at one
 * site is not a reason to leave the other's additions out of the library.
 */
export async function runSync(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  // Server actions are independently reachable endpoints — this is required.
  const { userId } = await verifySession();

  const force = formData.get("force") === "1";

  // --- MyAnimeList ---------------------------------------------------------
  let mal: SyncResult | null = null;
  let malError: { message: string; needsReauth?: boolean } | null = null;

  try {
    mal = await syncMalList(userId, { force });
  } catch (cause) {
    if (cause instanceof MalAuthError) {
      malError = {
        message: "Your MyAnimeList connection expired. Please reconnect.",
        needsReauth: true,
      };
    } else if (cause instanceof MalRateLimitError) {
      malError = {
        message: "MyAnimeList is rate limiting us. Try again in a few minutes.",
      };
    } else {
      malError = { message: (cause as Error).message };
    }
  }

  // --- AniList -------------------------------------------------------------
  let anilistAdded = 0;
  let anilistError: string | null = null;

  try {
    const anilist = await syncAniListList(userId, { force });
    anilistAdded = anilist.entriesAdded;
  } catch (cause) {
    if (cause instanceof AniListAuthError) {
      anilistError = "Your AniList connection expired. Please reconnect.";
    } else if (cause instanceof AniListRateLimitError) {
      anilistError = "AniList is rate limiting us. Try again in a few minutes.";
    } else {
      anilistError = (cause as Error).message;
    }
  }

  revalidatePath("/library");
  revalidatePath("/settings");

  // Both sides down is a failure. One side down still moved the library
  // forward, so it reports what happened rather than discarding the work.
  if (malError && anilistError) {
    return {
      ok: false,
      error: malError.message,
      needsReauth: malError.needsReauth,
    };
  }

  const parts: string[] = [];

  if (mal && !mal.skipped) {
    parts.push(`${mal.entries} titles synced`);
    if (mal.removed > 0) parts.push(`${mal.removed} removed`);
  }
  if (anilistAdded > 0) parts.push(`${anilistAdded} added from AniList`);

  // Everything connected was already fresh, and nothing failed.
  if (parts.length === 0 && !malError && !anilistError) {
    return {
      ok: true,
      result: mal ?? emptyResult(),
      message: "Already up to date.",
    };
  }

  if (malError) parts.push("MyAnimeList could not be reached");
  if (anilistError) parts.push("AniList could not be reached");

  return {
    ok: true,
    result: mal ?? emptyResult(),
    message: parts.join(", ") + ".",
  };
}

/** Stands in when MyAnimeList was never reached, so `result` stays non-null. */
function emptyResult(): SyncResult {
  return {
    skipped: true,
    titles: 0,
    entries: 0,
    removed: 0,
    pages: 0,
    durationMs: 0,
  };
}
