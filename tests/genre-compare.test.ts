import { describe, expect, it } from "vitest";

import { COMPARABLE_MAL_GENRE_IDS } from "@/lib/anilist/genres";
import { compareGenres } from "@/lib/data/genre-compare";

/**
 * Where MyAnimeList and AniList agree and differ on a title's genres.
 *
 * The rule that matters most is what is NOT compared: MAL's genre array also
 * carries themes and demographics that AniList has no genre for, and letting
 * those through would report a difference on nearly every title.
 */

const mal = (...names: [number, string][]) =>
  names.map(([id, name]) => ({ id, name }));

describe("compareGenres", () => {
  it("sorts genres into shared and one-site-only", () => {
    expect(
      compareGenres(
        mal([22, "Romance"], [10, "Fantasy"], [8, "Drama"]),
        ["Romance", "Fantasy", "Comedy"],
      ),
    ).toEqual({
      both: ["Romance", "Fantasy"],
      malOnly: ["Drama"],
      anilistOnly: ["Comedy"],
    });
  });

  it("reports no differences when the sites agree", () => {
    expect(
      compareGenres(mal([22, "Romance"], [10, "Fantasy"]), ["Fantasy", "Romance"]),
    ).toEqual({ both: ["Romance", "Fantasy"], malOnly: [], anilistOnly: [] });
  });

  it("ignores MAL themes and demographics, which AniList has no genre for", () => {
    const result = compareGenres(
      mal([22, "Romance"], [81, "Villainess"], [25, "Shoujo"], [62, "Isekai"]),
      ["Romance"],
    );
    expect(result?.malOnly).toEqual([]);
    expect(result?.both).toEqual(["Romance"]);
  });

  it("matches AniList's Thriller against MAL's Suspense", () => {
    expect(compareGenres(mal([45, "Suspense"]), ["Thriller"])).toEqual({
      both: ["Suspense"],
      malOnly: [],
      anilistOnly: [],
    });
  });

  it("uses MAL's names for genres only AniList gives", () => {
    expect(compareGenres(mal(), ["Thriller"])?.anilistOnly).toEqual(["Suspense"]);
  });

  // A site that did not answer has not said "no genres"; treating it as
  // empty would list every genre as the other site's alone.
  it("compares nothing when either site has not answered", () => {
    expect(compareGenres(null, ["Romance"])).toBeNull();
    expect(compareGenres(mal([22, "Romance"]), null)).toBeNull();
    expect(compareGenres(undefined, undefined)).toBeNull();
  });

  it("compares exactly the genres AniList has", () => {
    // One MAL id per AniList genre: nineteen, none shared.
    expect(COMPARABLE_MAL_GENRE_IDS.size).toBe(19);
  });
});
