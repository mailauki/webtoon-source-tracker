import { describe, expect, it } from "vitest";

import { malGenresFor } from "@/lib/anilist/genres";
import { kindForMalGenre } from "@/lib/data/mal-taxonomy";

/**
 * AniList's genres as MAL genre ids.
 *
 * The ids are what tags are linked by, so a wrong one files every AniList
 * title with that genre under the wrong category — and nothing downstream can
 * tell. They are pinned here against MAL's own manga genre ids.
 */

describe("malGenresFor", () => {
  it("maps each AniList genre onto its MAL genre id", () => {
    expect(malGenresFor(["Romance", "Fantasy", "Drama"])).toEqual([
      { id: 22, name: "Romance" },
      { id: 10, name: "Fantasy" },
      { id: 8, name: "Drama" },
    ]);
  });

  it("maps Thriller onto MAL's Suspense, its renamed counterpart", () => {
    expect(malGenresFor(["Thriller"])).toEqual([{ id: 45, name: "Suspense" }]);
  });

  it("covers every genre AniList has", () => {
    const anilist = [
      "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Hentai",
      "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological",
      "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural",
      "Thriller",
    ];
    expect(malGenresFor(anilist)).toHaveLength(anilist.length);
  });

  it("drops a genre it has no mapping for rather than guessing", () => {
    expect(malGenresFor(["Romance", "Something New"])).toEqual([
      { id: 22, name: "Romance" },
    ]);
  });

  it("survives a title with no genres", () => {
    expect(malGenresFor(null)).toEqual([]);
    expect(malGenresFor(undefined)).toEqual([]);
    expect(malGenresFor([])).toEqual([]);
  });

  it("lists each genre once", () => {
    expect(malGenresFor(["Romance", "Romance"])).toHaveLength(1);
  });

  // A tag created from an AniList genre takes its kind from the MAL name, and
  // the explicit kind is what the age gate reads. Getting this wrong would
  // put adult titles in front of accounts that have not confirmed their age.
  it("keeps the explicit genres behind the age gate", () => {
    for (const { name } of malGenresFor(["Ecchi", "Hentai"])) {
      expect(kindForMalGenre(name)).toBe("explicit");
    }
  });
});
