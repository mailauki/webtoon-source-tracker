import { describe, expect, it } from "vitest";

import {
  anilistIdPatch,
  findMismatches,
  mergeResults,
  type AniListHit,
  type MalHit,
} from "@/lib/data/cross-search";

/**
 * Merging one search across two catalogs.
 *
 * Worth its own file because both halves of the rule are invisible from the
 * outside when they go wrong. A too-eager mismatch rule flags every ongoing
 * series and trains the user to ignore the badge; a too-eager match rule
 * silently fuses two different titles into one row, which hides that anything
 * was conflated at all.
 */

function mal(over: Partial<MalHit> = {}): MalHit {
  return {
    mal_media_id: 1,
    title: "Solo Leveling",
    title_en: "Solo Leveling",
    main_picture_url: null,
    media_kind: "manhwa",
    num_chapters: 179,
    num_volumes: 14,
    mal_status: "finished",
    ...over,
  };
}

function anilist(over: Partial<AniListHit> = {}): AniListHit {
  return {
    anilist_media_id: 100,
    mal_media_id: 1,
    title: "Solo Leveling",
    title_en: "Solo Leveling",
    main_picture_url: null,
    media_kind: "MANGA",
    num_chapters: 179,
    num_volumes: 14,
    anilist_status: "FINISHED",
    ...over,
  };
}

describe("findMismatches", () => {
  it("finds nothing when the two sites agree", () => {
    expect(findMismatches(mal(), anilist())).toEqual([]);
  });

  it("flags a differing chapter count", () => {
    const found = findMismatches(mal({ num_chapters: 551 }), anilist({ num_chapters: 552 }));
    expect(found).toEqual([{ field: "chapters", mal: 551, anilist: 552 }]);
  });

  it("flags a differing English title", () => {
    const found = findMismatches(
      mal({ title_en: "Omniscient Reader" }),
      anilist({ title_en: "Omniscient Reader's Viewpoint" }),
    );
    expect(found).toEqual([
      {
        field: "title_en",
        mal: "Omniscient Reader",
        anilist: "Omniscient Reader's Viewpoint",
      },
    ]);
  });

  it("ignores punctuation and case differences in a title", () => {
    // Two house styles for one title is not a disagreement worth a badge.
    expect(
      findMismatches(mal({ title_en: "Re:Zero" }), anilist({ title_en: "re zero" })),
    ).toEqual([]);
  });

  // The important half. AniList leaves `chapters` null while a series is still
  // running, and MAL writes 0 for the same unknown — reading either as a real
  // count would flag nearly every ongoing title on the page.
  it("does not flag a count the other site has not recorded", () => {
    expect(findMismatches(mal({ num_chapters: 179 }), anilist({ num_chapters: null }))).toEqual([]);
    expect(findMismatches(mal({ num_chapters: 0 }), anilist({ num_chapters: 179 }))).toEqual([]);
  });

  it("does not flag a title the other site has not recorded", () => {
    expect(findMismatches(mal({ title_en: null }), anilist({ title_en: "Solo Leveling" }))).toEqual(
      [],
    );
  });
});

describe("mergeResults", () => {
  it("marks a title both sites have, matched on idMal", () => {
    const [row] = mergeResults([mal()], [anilist()]);
    expect(row.source).toBe("both");
    expect(row.mal_media_id).toBe(1);
    expect(row.anilist_media_id).toBe(100);
  });

  it("marks a title only MyAnimeList has", () => {
    const [row] = mergeResults([mal()], []);
    expect(row.source).toBe("mal");
    expect(row.anilist_media_id).toBeNull();
  });

  it("marks a title only AniList has", () => {
    const [row] = mergeResults([], [anilist({ mal_media_id: null })]);
    expect(row.source).toBe("anilist");
    expect(row.mal_media_id).toBeNull();
  });

  it("never merges two titles on name alone", () => {
    // Same title text, no shared idMal: a spin-off and its parent series look
    // exactly like this, and fusing them would hide one of the two entirely.
    const merged = mergeResults(
      [mal({ mal_media_id: 1, title: "Solo Leveling" })],
      [anilist({ anilist_media_id: 100, mal_media_id: null, title: "Solo Leveling" })],
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.source)).toEqual(["mal", "anilist"]);
  });

  it("carries the mismatch onto a merged row", () => {
    const [row] = mergeResults([mal({ num_volumes: 14 })], [anilist({ num_volumes: 15 })]);
    expect(row.mismatches).toEqual([{ field: "volumes", mal: 14, anilist: 15 }]);
  });

  it("leads with MyAnimeList's order, then AniList-only hits", () => {
    const merged = mergeResults(
      [mal({ mal_media_id: 1 }), mal({ mal_media_id: 2 })],
      [anilist({ anilist_media_id: 100, mal_media_id: 2 }), anilist({ anilist_media_id: 200, mal_media_id: null })],
    );
    expect(merged.map((r) => r.key)).toEqual(["mal:1", "mal:2", "anilist:200"]);
  });

  it("prefers MyAnimeList's display values on a merged row", () => {
    // The library is keyed on MAL ids, so what is shown before adding should
    // be what gets stored. The AniList value survives in `mismatches`.
    const [row] = mergeResults(
      [mal({ title: "Solo Leveling" })],
      [anilist({ title: "Na Honjaman Level Up" })],
    );
    expect(row.title).toBe("Solo Leveling");
  });

  it("keeps one AniList hit when two claim the same MAL id", () => {
    const merged = mergeResults(
      [mal({ mal_media_id: 1 })],
      [
        anilist({ anilist_media_id: 100, mal_media_id: 1 }),
        anilist({ anilist_media_id: 101, mal_media_id: 1 }),
      ],
    );
    // The first wins the merge; the duplicate is still reported rather than
    // dropped, since it is a real, separate AniList entry.
    expect(merged[0].anilist_media_id).toBe(100);
    expect(merged).toHaveLength(2);
    expect(merged[1].source).toBe("anilist");
  });
});

describe("anilistIdPatch", () => {
  it("writes the id the search resolved", () => {
    expect(anilistIdPatch(105398)).toEqual({ anilist_media_id: 105398 });
  });

  // The one that matters. media_titles is shared, so an upsert carrying an
  // explicit null would blank an id another user's mirror already cached and
  // send every later mirror back to AniList to resolve it again. The write
  // succeeds either way, so nothing else would catch this.
  it("omits the column entirely when there is no id, rather than nulling it", () => {
    expect(anilistIdPatch(undefined)).toEqual({});
    expect(anilistIdPatch(null)).toEqual({});
    expect("anilist_media_id" in anilistIdPatch(null)).toBe(false);
  });
});
