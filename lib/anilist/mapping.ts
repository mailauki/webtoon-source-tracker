import type { MalListStatus } from "@/lib/mal/types";

import type { AniListListStatus } from "./types";

/**
 * Translation between AniList's list vocabulary and MyAnimeList's.
 *
 * Kept free of server-only imports so the account-sync planner, and the tests,
 * can use it directly.
 *
 * The one mapping that is not one-to-one is re-reading. AniList has a status
 * for it, REPEATING; MAL has a flag, `is_rereading`, alongside a status. The
 * app stores MAL's shape, so REPEATING arrives as `reading` + rereading, and
 * anything with the flag set goes to AniList as REPEATING whatever its status
 * — MAL's own site pairs the flag with `completed`, and the two must compare
 * equal or every sync would rewrite the same entry back and forth.
 */

export type MalShape = { status: MalListStatus; is_rereading: boolean };

const TO_MAL: Record<AniListListStatus, MalShape> = {
  CURRENT: { status: "reading", is_rereading: false },
  PLANNING: { status: "plan_to_read", is_rereading: false },
  COMPLETED: { status: "completed", is_rereading: false },
  DROPPED: { status: "dropped", is_rereading: false },
  PAUSED: { status: "on_hold", is_rereading: false },
  REPEATING: { status: "reading", is_rereading: true },
};

const TO_ANILIST: Record<MalListStatus, AniListListStatus> = {
  reading: "CURRENT",
  plan_to_read: "PLANNING",
  completed: "COMPLETED",
  dropped: "DROPPED",
  on_hold: "PAUSED",
};

export function toMalStatus(status: AniListListStatus): MalShape {
  return TO_MAL[status];
}

export function toAniListStatus(
  status: MalListStatus,
  isRereading: boolean,
): AniListListStatus {
  return isRereading ? "REPEATING" : TO_ANILIST[status];
}

/**
 * A 0–10 score as MAL stores it, from AniList's POINT_10 reading.
 *
 * POINT_10 can come back fractional for a user whose own format is
 * POINT_100 or POINT_10_DECIMAL (an 85 reads as 8.5); MAL only takes whole
 * numbers, so it is rounded rather than truncated.
 */
export function toMalScore(point10: number | null | undefined): number {
  if (!point10 || !Number.isFinite(point10)) return 0;
  return Math.min(10, Math.max(0, Math.round(point10)));
}

/**
 * The value for SaveMediaListEntry's `scoreRaw`, which is always 0–100 no
 * matter which format the user displays scores in. Writing `score` instead
 * would be read in the user's own format — a 7 sent to a POINT_100 user
 * lands as 7/100.
 */
export function toAniListScoreRaw(malScore: number): number {
  return Math.min(100, Math.max(0, Math.round(malScore * 10)));
}

/**
 * AniList's publication status in MyAnimeList's vocabulary.
 *
 * The app stores MAL's spelling in `media_titles.mal_status`, and
 * lib/data/chapter-totals.ts decides whether a chapter count is final by
 * matching against it. An AniList-only row that stored "FINISHED" verbatim
 * would never match `finished`, so a completed series would read as still
 * running and its chapter count as provisional.
 *
 * NOT_YET_RELEASED has no MAL counterpart and maps to null: "no status" is
 * already how the rest of the app spells "unknown", and it reads as
 * not-settled, which is correct for something that has not started.
 */
const ANILIST_STATUS_TO_MAL: Record<string, string | null> = {
  FINISHED: "finished",
  RELEASING: "currently_publishing",
  CANCELLED: "discontinued",
  HIATUS: "on_hiatus",
  NOT_YET_RELEASED: null,
};

export function toMalPublicationStatus(
  status: string | null | undefined,
): string | null {
  return status ? (ANILIST_STATUS_TO_MAL[status] ?? null) : null;
}

/**
 * MAL's `media_type` for an AniList title, from its format and country.
 *
 * AniList has one MANGA format for every comic and says where it is from in
 * `countryOfOrigin` instead, where MAL splits the same titles into manga,
 * manhwa and manhua. Reading the country is what keeps a Korean webtoon that
 * only AniList has off the Manga shelf. The rest lowercase into MAL's own
 * spelling (ONE_SHOT → one_shot); NOVEL stays `novel`, since AniList has no
 * separate light-novel format to tell the two apart.
 */
export function toMalMediaKind(
  format: string | null | undefined,
  countryOfOrigin: string | null | undefined,
): string | null {
  if (!format) return null;
  if (format !== "MANGA") return format.toLowerCase();

  switch (countryOfOrigin) {
    case "KR":
      return "manhwa";
    // Taiwanese comics are manhua too; MAL files them the same way.
    case "CN":
    case "TW":
      return "manhua";
    default:
      return "manga";
  }
}
