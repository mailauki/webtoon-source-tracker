import "server-only";

import { AniListAuthError, AniListRateLimitError } from "@/lib/anilist/errors";
import { enforceRemovalRules } from "@/lib/entries/removal-rules";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { progressSlice, type ProgressReporter, type SyncProgress } from "./progress";
import { syncAniListList } from "./sync-anilist";
import { syncMalList, type SyncResult } from "./sync-list";

export type RefreshResult =
  | { ok: true; message: string }
  | { ok: false; error: string; needsReauth?: boolean };

/** One line of the library-refresh stream (newline-delimited JSON). */
export type RefreshEvent =
  | ({ type: "progress" } & SyncProgress)
  | { type: "done"; message: string }
  | { type: "error"; error: string; needsReauth?: boolean };

/** Where removal rules start on the bar; the pulls share everything before. */
const RULES_AT = 0.92;

/**
 * Refresh library: brings the signed-in user's library up to date from every
 * site they have connected. Reads from MyAnimeList and AniList; never writes
 * to them.
 *
 * One action rather than one per site: "refresh my library" is the user's
 * whole intent, and making them choose a provider would be asking them to
 * care about a split the app is supposed to hide. Whichever sites are
 * connected are the ones that run; a disconnected site is simply skipped.
 *
 * The two halves are independent on purpose. MyAnimeList failing must not stop
 * the AniList pull — they answer for different titles, and an outage at one
 * site is not a reason to leave the other's additions out of the library.
 *
 * `onProgress` drives the bar under the Refresh button. Each pull reports its
 * own 0–1, placed on the whole by how many sites are connected, so a library
 * linked to one site does not sit at half for the missing other.
 */
export async function refreshLibrary(
  userId: string,
  options: { force?: boolean; onProgress?: ProgressReporter } = {},
): Promise<RefreshResult> {
  const { force = false, onProgress } = options;

  // Only to divide the bar between the sites. The pulls check their own
  // connection again, and stay the authority on whether they run.
  let malShare = 0.5;
  if (onProgress) {
    const admin = createAdminClient();
    const [{ data: mal }, { data: anilist }] = await Promise.all([
      admin.from("mal_connections").select("status").eq("user_id", userId).maybeSingle(),
      admin.from("anilist_connections").select("status").eq("user_id", userId).maybeSingle(),
    ]);
    const malActive = mal?.status === "active";
    const anilistActive = anilist?.status === "active";
    malShare = malActive && anilistActive ? 0.6 : malActive ? 1 : 0;
    onProgress("Starting", 0);
  }

  // --- MyAnimeList ---------------------------------------------------------
  let mal: SyncResult | null = null;
  let malError: { message: string; needsReauth?: boolean } | null = null;

  try {
    mal = await syncMalList(userId, {
      force,
      onProgress: progressSlice(onProgress, 0, RULES_AT * malShare),
    });
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
    const anilist = await syncAniListList(userId, {
      force,
      onProgress: progressSlice(onProgress, RULES_AT * malShare, RULES_AT),
    });
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

  // After both pulls, so titles either site just brought in, statuses that
  // changed there and genres the sync added are all checked against the
  // user's removal rules. A failure here must not hide what the sync did.
  onProgress?.("Applying your removal rules", RULES_AT);
  const rules = await enforceRemovalRules(await createClient(), userId).catch(
    () => null,
  );

  // Both sides down is a failure. One side down still moved the library
  // forward, so it reports what happened rather than discarding the work.
  if (malError && anilistError) {
    return {
      ok: false,
      error: malError.message,
      needsReauth: malError.needsReauth,
    };
  }

  return {
    ok: true,
    message: describeRefresh({
      mal,
      anilistAdded,
      rulesRemoved: rules?.removed ?? 0,
      malFailed: malError !== null,
      anilistFailed: anilistError !== null,
    }),
  };
}

/** The sentence the toast shows after a refresh that did not fail outright. */
export function describeRefresh(run: {
  mal: Pick<SyncResult, "skipped" | "entries" | "removed"> | null;
  anilistAdded: number;
  rulesRemoved: number;
  malFailed: boolean;
  anilistFailed: boolean;
}): string {
  const parts: string[] = [];

  if (run.mal && !run.mal.skipped) {
    parts.push(`${run.mal.entries} titles synced`);
    if (run.mal.removed > 0) parts.push(`${run.mal.removed} removed`);
  }
  if (run.anilistAdded > 0) parts.push(`${run.anilistAdded} added from AniList`);
  if (run.rulesRemoved > 0) parts.push(`${run.rulesRemoved} removed by your rules`);

  // Everything connected was already fresh, and nothing failed.
  if (parts.length === 0 && !run.malFailed && !run.anilistFailed) {
    return "Already up to date.";
  }

  if (run.malFailed) parts.push("MyAnimeList could not be reached");
  if (run.anilistFailed) parts.push("AniList could not be reached");

  return parts.join(", ") + ".";
}
