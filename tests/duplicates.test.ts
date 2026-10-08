import { describe, expect, it } from "vitest";

import { duplicateKey, findDuplicates, type DuplicateRow } from "@/lib/data/duplicates";

function row(
  id: number,
  ids: { mal?: number; anilist?: number },
  title: string,
  kind: string | null = "manhwa",
  more: Partial<DuplicateRow["media_titles"]> = {},
): DuplicateRow {
  return {
    id,
    media_titles: {
      id: id * 100,
      mal_media_id: ids.mal ?? null,
      anilist_media_id: ids.anilist ?? null,
      title,
      title_en: null,
      alt_titles: [],
      mal_media_kind: kind,
      ...more,
    },
  };
}

const ids = (pairs: ReturnType<typeof findDuplicates>) =>
  pairs.map((pair) => [pair.anilist.id, pair.mal.id]);

describe("findDuplicates", () => {
  it("pairs an AniList-only title with the unlinked MyAnimeList title of the same name", () => {
    expect(
      ids(
        findDuplicates([
          row(1, { anilist: 900 }, "Akdangeul Napchihan Spy"),
          row(2, { mal: 500 }, "akdangeul napchihan spy!"),
        ]),
      ),
    ).toEqual([[1, 2]]);
  });

  it("matches on any name either side has", () => {
    expect(
      ids(
        findDuplicates([
          row(1, { anilist: 900 }, "Romaji Name", "manhwa", { title_en: "The Little Spy" }),
          row(2, { mal: 500 }, "Other", "manhwa", { alt_titles: ["The Little Spy"] }),
        ]),
      ),
    ).toEqual([[1, 2]]);
  });

  // A MAL title that already knows its AniList id is AniList saying it is
  // some other entry; the automatic merge owns anything that does match.
  it("leaves a MyAnimeList title that already has an AniList id", () => {
    expect(
      findDuplicates([
        row(1, { anilist: 900 }, "Same Name"),
        row(2, { mal: 500, anilist: 901 }, "Same Name"),
      ]),
    ).toEqual([]);
  });

  it("never pairs a novel with its comic", () => {
    expect(
      findDuplicates([
        row(1, { anilist: 900 }, "Same Name", "light_novel"),
        row(2, { mal: 500 }, "Same Name", "manhwa"),
      ]),
    ).toEqual([]);
  });

  it("refuses an ambiguous name", () => {
    expect(
      findDuplicates([
        row(1, { anilist: 900 }, "Same Name"),
        row(2, { mal: 500 }, "Same Name"),
        row(3, { mal: 501 }, "Same Name"),
      ]),
    ).toEqual([]);
    expect(
      findDuplicates([
        row(1, { anilist: 900 }, "Same Name"),
        row(2, { anilist: 901 }, "Same Name"),
        row(3, { mal: 500 }, "Same Name"),
      ]),
    ).toEqual([]);
  });

  it("ignores names too short to tell titles apart", () => {
    expect(
      findDuplicates([row(1, { anilist: 900 }, "Oz"), row(2, { mal: 500 }, "Oz")]),
    ).toEqual([]);
  });

  it("leaves out a pair the user dismissed, and only that pair", () => {
    const rows = [
      row(1, { anilist: 900 }, "First Title"),
      row(2, { mal: 500 }, "First Title"),
      row(3, { anilist: 901 }, "Second Title"),
      row(4, { mal: 501 }, "Second Title"),
    ];
    // Fixture catalog ids are the entry id times 100.
    expect(ids(findDuplicates(rows, new Set([duplicateKey(100, 200)])))).toEqual([[3, 4]]);
  });
});
