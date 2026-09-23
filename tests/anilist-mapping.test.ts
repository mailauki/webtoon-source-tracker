import { describe, expect, it } from "vitest";

import {
  toAniListScoreRaw,
  toAniListStatus,
  toMalScore,
  toMalStatus,
  toMalPublicationStatus,
} from "@/lib/anilist/mapping";
import { ANILIST_LIST_STATUSES } from "@/lib/anilist/types";
import { MAL_LIST_STATUSES } from "@/lib/mal/types";

describe("list status mapping", () => {
  it("round-trips every MAL status", () => {
    for (const status of MAL_LIST_STATUSES) {
      expect(toMalStatus(toAniListStatus(status, false))).toEqual({
        status,
        is_rereading: false,
      });
    }
  });

  it("maps every AniList status to MAL", () => {
    for (const status of ANILIST_LIST_STATUSES) {
      expect(MAL_LIST_STATUSES).toContain(toMalStatus(status).status);
    }
  });

  it("sends a reread as REPEATING whatever MAL's status says", () => {
    expect(toAniListStatus("completed", true)).toBe("REPEATING");
    expect(toAniListStatus("reading", true)).toBe("REPEATING");
  });

  it("reads REPEATING as reading, with the reread flag", () => {
    expect(toMalStatus("REPEATING")).toEqual({ status: "reading", is_rereading: true });
  });
});

describe("score mapping", () => {
  it("rounds AniList's POINT_10 reading to MAL's whole numbers", () => {
    expect(toMalScore(8.5)).toBe(9);
    expect(toMalScore(8.4)).toBe(8);
    expect(toMalScore(10)).toBe(10);
  });

  it("reads a missing score as unscored", () => {
    expect(toMalScore(null)).toBe(0);
    expect(toMalScore(undefined)).toBe(0);
    expect(toMalScore(0)).toBe(0);
  });

  it("writes scoreRaw on AniList's 0–100 scale", () => {
    expect(toAniListScoreRaw(7)).toBe(70);
    expect(toAniListScoreRaw(0)).toBe(0);
    expect(toAniListScoreRaw(10)).toBe(100);
  });
});

describe("toMalPublicationStatus", () => {
  // media_titles.mal_status stores MAL's spelling, and chapterTotal() decides
  // whether a chapter count is final by matching against it. An AniList status
  // stored verbatim would never match, so a finished series would read as
  // ongoing and its count as provisional.
  it("translates into the vocabulary chapterTotal matches on", () => {
    expect(toMalPublicationStatus("FINISHED")).toBe("finished");
    expect(toMalPublicationStatus("CANCELLED")).toBe("discontinued");
    expect(toMalPublicationStatus("RELEASING")).toBe("currently_publishing");
    expect(toMalPublicationStatus("HIATUS")).toBe("on_hiatus");
  });

  it("treats a status with no MAL counterpart as unknown", () => {
    expect(toMalPublicationStatus("NOT_YET_RELEASED")).toBeNull();
    expect(toMalPublicationStatus(null)).toBeNull();
    expect(toMalPublicationStatus("SOMETHING_NEW")).toBeNull();
  });
});
