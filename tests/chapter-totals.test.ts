import { describe, expect, it } from "vitest";

import {
  chapterTotal,
  ownAllLabel,
  ownedCountLabel,
} from "@/lib/data/chapter-totals";

describe("chapterTotal", () => {
  it("reads a finished series as a final count", () => {
    expect(
      chapterTotal({ num_chapters: 179, mal_status: "finished" }),
    ).toEqual({ count: 179, final: true });
  });

  it("treats a discontinued series as final too", () => {
    // Dropped by its publisher: no more chapters are coming, so the count is
    // the whole of it.
    expect(
      chapterTotal({ num_chapters: 42, mal_status: "discontinued" }),
    ).toEqual({ count: 42, final: true });
  });

  it("reads a publishing series as a count that will grow", () => {
    expect(
      chapterTotal({ num_chapters: 41, mal_status: "currently_publishing" }),
    ).toEqual({ count: 41, final: false });
  });

  // MAL's own upstream hiatus, not the per-source flag the user sets. A paused
  // series can resume, so its count is not final.
  it("does not treat an upstream hiatus as final", () => {
    expect(chapterTotal({ num_chapters: 60, mal_status: "on_hiatus" })).toEqual(
      { count: 60, final: false },
    );
  });

  it("offers nothing when MAL has no count", () => {
    // 0 and null both mean "not counted" in this schema, and neither is a
    // total worth offering to mark owned.
    expect(chapterTotal({ num_chapters: 0, mal_status: "finished" })).toBeNull();
    expect(
      chapterTotal({ num_chapters: null, mal_status: "currently_publishing" }),
    ).toBeNull();
  });

  it("survives a title it was given nothing for", () => {
    expect(chapterTotal(null)).toBeNull();
    expect(chapterTotal(undefined)).toBeNull();
  });

  // A status MAL adds later, or one this app has never seen, must not be
  // guessed as final — the safe reading is "still going".
  it("treats an unknown status as not final", () => {
    expect(
      chapterTotal({ num_chapters: 10, mal_status: "something_new" }),
    ).toEqual({ count: 10, final: false });
    expect(chapterTotal({ num_chapters: 10, mal_status: null })).toEqual({
      count: 10,
      final: false,
    });
  });
});

describe("ownAllLabel", () => {
  it("promises the whole series when the count is final", () => {
    expect(ownAllLabel({ count: 179, final: true })).toBe("Own all 179");
  });

  // The qualifier is the honest part: next month this number is wrong.
  it("qualifies a count that is still growing", () => {
    expect(ownAllLabel({ count: 41, final: false })).toBe("Own all 41 so far");
  });
});

describe("ownedCountLabel", () => {
  it("states a bare count when there is no total to compare against", () => {
    expect(ownedCountLabel(40, null)).toBe("40 chapters owned here");
  });

  it("states the count against the total when there is one", () => {
    expect(ownedCountLabel(40, { count: 179, final: true })).toBe(
      "40 of 179 chapters owned here",
    );
  });

  it("says so plainly when a finished series is owned outright", () => {
    expect(ownedCountLabel(179, { count: 179, final: true })).toBe(
      "All 179 chapters owned here",
    );
  });

  // Caught up on something still publishing is not "all" — more is coming, so
  // the ratio is the honest form.
  it("does not claim all of a series that is still publishing", () => {
    expect(ownedCountLabel(41, { count: 41, final: false })).toBe(
      "41 of 41 chapters owned here",
    );
  });

  // MAL's count lags reality often enough that this is not a hypothetical.
  it("drops the ratio when the count runs past a stale total", () => {
    expect(ownedCountLabel(45, { count: 41, final: false })).toBe(
      "45 chapters owned here",
    );
  });
});
