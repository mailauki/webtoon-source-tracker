import { describe, expect, it } from "vitest";

import {
  anilistIdPatch,
  countUnmatchedToAniList,
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

  it("records that an idMal match came from AniList's own link", () => {
    const [row] = mergeResults([mal()], [anilist()]);
    expect(row.matched_on).toBe("mal_id");
  });

  it("leaves matched_on empty on a row only one site had", () => {
    const merged = mergeResults([mal()], [anilist({ mal_media_id: null, anilist_media_id: 5, title: "Other Title" })]);
    expect(merged.map((r) => r.matched_on)).toEqual([null, null]);
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

describe("mergeResults, lining up a missing idMal by name", () => {
  // The case that prompted the fallback: a manhwa AniList records no MAL id
  // for, known by a different English name on each site but by one Korean
  // title on both.
  const malHit = mal({
    mal_media_id: 7,
    title: "Seobeu Namjunim, Gyeyak Gyeolhon-iramyeonseoyo?",
    title_en: "Contract Marriage with the Second Lead",
    alt_titles: ["서브 남주님, 계약 결혼이라면서요?"],
    media_kind: "manhwa",
  });
  const anilistHit = anilist({
    anilist_media_id: 700,
    mal_media_id: null,
    title: "Seobeu Namjunim, Gyeyak Gyeolhon-iramyeonseoyo?",
    title_en: "Second Male Lead, You Said It Was a Contract Marriage?",
    alt_titles: ["서브 남주님, 계약 결혼이라면서요?"],
    media_kind: "manhwa",
  });

  it("merges when a name matches exactly and the kinds agree", () => {
    const merged = mergeResults([malHit], [anilistHit]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      source: "both",
      mal_media_id: 7,
      anilist_media_id: 700,
      matched_on: "title",
    });
  });

  it("matches on the native-script title alone", () => {
    const merged = mergeResults(
      [malHit],
      [anilistHit].map((h) => ({ ...h, title: "Something Else Entirely" })),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].matched_on).toBe("title");
  });

  it("ignores case and punctuation, but not typos", () => {
    const loose = mergeResults(
      [mal({ mal_media_id: 1, title: "Re:Zero Kara", title_en: null, media_kind: "manga" })],
      [anilist({ mal_media_id: null, title: "RE ZERO KARA", title_en: null, media_kind: "manga" })],
    );
    expect(loose).toHaveLength(1);

    const typo = mergeResults(
      [mal({ mal_media_id: 1, title: "Re:Zero Kara", title_en: null, media_kind: "manga" })],
      [anilist({ mal_media_id: null, title: "Re:Zero Kra", title_en: null, media_kind: "manga" })],
    );
    expect(typo).toHaveLength(2);
  });

  it("never merges a novel with its adaptation", () => {
    const merged = mergeResults(
      [malHit],
      [{ ...anilistHit, media_kind: "novel" }],
    );
    expect(merged.map((r) => r.source)).toEqual(["mal", "anilist"]);
  });

  it("lets MAL's two prose kinds match AniList's one", () => {
    const merged = mergeResults(
      [{ ...malHit, media_kind: "light_novel" }],
      [{ ...anilistHit, media_kind: "novel" }],
    );
    expect(merged).toHaveLength(1);
  });

  it("refuses when either side has no kind", () => {
    const merged = mergeResults([malHit], [{ ...anilistHit, media_kind: null }]);
    expect(merged).toHaveLength(2);
  });

  it("refuses when the name fits more than one MAL row", () => {
    const merged = mergeResults(
      [malHit, { ...malHit, mal_media_id: 8 }],
      [anilistHit],
    );
    expect(merged.map((r) => r.source)).toEqual(["mal", "mal", "anilist"]);
  });

  it("ignores names too short to identify a title", () => {
    const merged = mergeResults(
      [mal({ mal_media_id: 1, title: "Oz", title_en: null, media_kind: "manga" })],
      [anilist({ mal_media_id: null, title: "Oz", title_en: null, media_kind: "manga" })],
    );
    expect(merged).toHaveLength(2);
  });

  it("never takes a MAL row AniList already linked by id", () => {
    const linked = anilist({ anilist_media_id: 701, mal_media_id: 7 });
    const merged = mergeResults([malHit], [linked, anilistHit]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ anilist_media_id: 701, matched_on: "mal_id" });
    expect(merged[1]).toMatchObject({ anilist_media_id: 700, source: "anilist" });
  });

  it("gives a MAL row to the first of two AniList hits claiming it by name", () => {
    const merged = mergeResults(
      [malHit],
      [anilistHit, { ...anilistHit, anilist_media_id: 702 }],
    );
    expect(merged.map((r) => r.anilist_media_id)).toEqual([700, 702]);
    expect(merged.map((r) => r.source)).toEqual(["both", "anilist"]);
  });

  it("does not second-guess an idMal that points elsewhere", () => {
    // AniList linked this hit to MAL 99, which is not in the results; the
    // shared name with MAL 7 does not override that.
    const merged = mergeResults(
      [malHit],
      [{ ...anilistHit, mal_media_id: 99 }],
    );
    expect(merged.map((r) => r.source)).toEqual(["mal", "anilist"]);
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

describe("countUnmatchedToAniList", () => {
  const row = (anilist_media_id: number | null) => ({
    media_titles: { anilist_media_id },
  });

  it("counts rows that have never been matched to AniList", () => {
    expect(countUnmatchedToAniList([row(null), row(105398), row(null)])).toBe(2);
  });

  // Reaches zero exactly when there is nothing left to push, which is what
  // makes the notice disappear on its own rather than nagging forever.
  it("is zero once every row carries an AniList id", () => {
    expect(countUnmatchedToAniList([row(1), row(2)])).toBe(0);
    expect(countUnmatchedToAniList([])).toBe(0);
  });

  it("treats a missing join as unmatched rather than throwing", () => {
    expect(countUnmatchedToAniList([{}, { media_titles: null }])).toBe(2);
  });
});
