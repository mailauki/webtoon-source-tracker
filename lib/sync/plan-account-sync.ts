import { toMalScore, toMalStatus } from "@/lib/anilist/mapping";
import type { AniListListEntry } from "@/lib/anilist/types";
import type { MalListEntry, MalListStatus } from "@/lib/mal/types";

/**
 * Decides what the MyAnimeList <-> AniList account sync should write.
 *
 * Pure on purpose: the executor in account-sync.ts does the fetching and the
 * writing, and this is the part where a mistake overwrites someone's progress
 * on a service this app does not own. It is tested on its own for that
 * reason (tests/plan-account-sync.test.ts).
 *
 * Titles are matched by MAL id, which AniList carries as `idMal`. A title
 * AniList knows only by its own id cannot be matched and never reaches here.
 *
 * Rules, in order:
 *   1. Nothing is ever deleted. A title on one side only is *copied* to the
 *      other, if the direction allows it, never removed from where it is.
 *      Deletion is the one mistake a sync cannot take back.
 *   2. Titles that already agree are left alone, so re-running is a no-op.
 *   3. Where they disagree, the direction picks the winner. Two-way picks the
 *      side edited most recently, and falls back to MAL — the app's source of
 *      truth — when that cannot be told (a missing or equal timestamp).
 *   4. A list that was cut short (see `complete`) is not proof a title is
 *      absent from that account — it may sit past the cutoff with newer
 *      progress than the copy would bring. So nothing is copied *onto* an
 *      incomplete side for a title it appears not to have.
 */

export type ListState = {
  status: MalListStatus;
  chapters: number;
  volumes: number;
  score: number;
  rereading: boolean;
  /** Milliseconds since the epoch, or null when the service gave none. */
  updatedAt: number | null;
};

export const SYNC_DIRECTIONS = ["two_way", "mal_to_anilist", "anilist_to_mal"] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

export type PlannedWrite = {
  malId: number;
  target: "mal" | "anilist";
  state: ListState;
};

export type AccountSyncResult = {
  toMal: number;
  toAniList: number;
  /** Titles on both sides that already agreed. */
  inSync: number;
  /** Titles that exist on only one service's catalog, so cannot be matched. */
  unmatched: number;
  /** Writes held back by the per-run cap or a rate limit; run again for these. */
  remaining: number;
  /** Writes withheld because the user excluded that title from that site. */
  excluded: number;
  /** Writes a service rejected outright. */
  failed: number;
};

export type AccountSyncPlan = {
  writes: PlannedWrite[];
  /** Titles present on both sides that already agree. */
  inSync: number;
};

/**
 * Whether two states say the same thing.
 *
 * Re-reading is compared as a flag, with the status ignored while it is set:
 * AniList's REPEATING arrives as `reading`, while MAL's site keeps a reread
 * title at `completed`. Both mean "reading it again", and comparing the
 * statuses would rewrite the same entry back and forth on every sync.
 */
export function sameState(a: ListState, b: ListState): boolean {
  if (a.rereading !== b.rereading) return false;
  if (!a.rereading && a.status !== b.status) return false;
  return a.chapters === b.chapters && a.volumes === b.volumes && a.score === b.score;
}

function winner(
  mal: ListState,
  anilist: ListState,
  direction: SyncDirection,
): "mal" | "anilist" {
  if (direction === "mal_to_anilist") return "mal";
  if (direction === "anilist_to_mal") return "anilist";

  // Two-way: newest edit wins, ties and unknowns go to MAL.
  if (anilist.updatedAt !== null && (mal.updatedAt === null || anilist.updatedAt > mal.updatedAt)) {
    return "anilist";
  }
  return "mal";
}

export function planAccountSync(
  mal: Map<number, ListState>,
  anilist: Map<number, ListState>,
  direction: SyncDirection,
  complete: { mal: boolean; anilist: boolean } = { mal: true, anilist: true },
): AccountSyncPlan {
  const writes: PlannedWrite[] = [];
  let inSync = 0;

  const copiesToAniList = direction !== "anilist_to_mal" && complete.anilist;
  const copiesToMal = direction !== "mal_to_anilist" && complete.mal;

  for (const [malId, malState] of mal) {
    const anilistState = anilist.get(malId);

    if (!anilistState) {
      if (copiesToAniList) writes.push({ malId, target: "anilist", state: malState });
      continue;
    }

    if (sameState(malState, anilistState)) {
      inSync++;
      continue;
    }

    if (winner(malState, anilistState, direction) === "mal") {
      writes.push({ malId, target: "anilist", state: malState });
    } else {
      writes.push({ malId, target: "mal", state: anilistState });
    }
  }

  for (const [malId, anilistState] of anilist) {
    if (mal.has(malId)) continue;
    if (copiesToMal) writes.push({ malId, target: "mal", state: anilistState });
  }

  return { writes, inSync };
}

/** A MAL list entry as a ListState, or null when it carries no list status. */
export function fromMalEntry(entry: MalListEntry): ListState | null {
  const ls = entry.list_status;
  if (!ls) return null;

  const updatedAt = ls.updated_at ? Date.parse(ls.updated_at) : NaN;
  return {
    status: ls.status,
    chapters: ls.num_chapters_read,
    volumes: ls.num_volumes_read,
    score: ls.score,
    rereading: ls.is_rereading,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
  };
}

/** An AniList list entry as a ListState, or null when it carries no status. */
export function fromAniListEntry(entry: AniListListEntry): ListState | null {
  if (!entry.status) return null;

  const { status, is_rereading } = toMalStatus(entry.status);
  return {
    status,
    chapters: entry.progress ?? 0,
    volumes: entry.progressVolumes ?? 0,
    score: toMalScore(entry.score),
    rereading: is_rereading,
    // AniList sends seconds, and 0 for "never recorded".
    updatedAt: entry.updatedAt ? entry.updatedAt * 1000 : null,
  };
}

/** "12 titles updated on AniList. 240 already matched.", for the settings page. */
export function describeAccountSync(result: AccountSyncResult): string {
  const plural = (n: number) => (n === 1 ? "title" : "titles");
  const parts: string[] = [];

  if (result.toAniList === 0 && result.toMal === 0) {
    parts.push("Nothing to change.");
  } else {
    const writes: string[] = [];
    if (result.toAniList > 0) {
      writes.push(`${result.toAniList} ${plural(result.toAniList)} updated on AniList`);
    }
    if (result.toMal > 0) {
      writes.push(`${result.toMal} ${plural(result.toMal)} updated on MyAnimeList`);
    }
    parts.push(`${writes.join(", ")}.`);
  }

  if (result.inSync > 0) parts.push(`${result.inSync} already matched.`);
  if (result.unmatched > 0) {
    parts.push(
      `${result.unmatched} ${plural(result.unmatched)} couldn't be matched between the two sites and ${result.unmatched === 1 ? "was" : "were"} skipped.`,
    );
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} ${plural(result.failed)} couldn't be saved.`);
  }
  if (result.excluded > 0) {
    parts.push(
      `${result.excluded} ${plural(result.excluded)} skipped because you turned syncing off for ${result.excluded === 1 ? "it" : "them"}.`,
    );
  }
  if (result.remaining > 0) {
    parts.push(`${result.remaining} more to go — run it again to continue.`);
  }

  return parts.join(" ");
}
