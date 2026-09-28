/**
 * AniList's genres, as the MyAnimeList genres the tag vocabulary is keyed on.
 *
 * Tags carry a `mal_genre_id` and are linked by it (see syncGenres in
 * lib/sync/sync-list.ts), so an AniList genre joins the same tag a MAL title
 * with that genre already has. "Romance" from either site lands under one
 * Romance category, not two.
 *
 * AniList's genre list is small and fixed, and every entry has a MAL
 * counterpart. The names match except one: MAL renamed Thriller to Suspense.
 * The MAL name is what a tag is created with if none exists yet, so it is the
 * one kept here — and it is what kindForMalGenre reads to put Ecchi and
 * Hentai under the explicit kind the age gate checks.
 *
 * AniList's community tags (Villainess, Regression, …) are a different field
 * and deliberately not mapped here.
 */
const MAL_GENRE_BY_ANILIST: Record<string, { id: number; name: string }> = {
  Action: { id: 1, name: "Action" },
  Adventure: { id: 2, name: "Adventure" },
  Comedy: { id: 4, name: "Comedy" },
  Drama: { id: 8, name: "Drama" },
  Ecchi: { id: 9, name: "Ecchi" },
  Fantasy: { id: 10, name: "Fantasy" },
  Hentai: { id: 12, name: "Hentai" },
  Horror: { id: 14, name: "Horror" },
  "Mahou Shoujo": { id: 66, name: "Mahou Shoujo" },
  Mecha: { id: 18, name: "Mecha" },
  Music: { id: 19, name: "Music" },
  Mystery: { id: 7, name: "Mystery" },
  Psychological: { id: 40, name: "Psychological" },
  Romance: { id: 22, name: "Romance" },
  "Sci-Fi": { id: 24, name: "Sci-Fi" },
  "Slice of Life": { id: 36, name: "Slice of Life" },
  Sports: { id: 30, name: "Sports" },
  Supernatural: { id: 37, name: "Supernatural" },
  Thriller: { id: 45, name: "Suspense" },
};

/**
 * The MAL genre ids AniList has a genre for. Only these can be compared
 * between the two sites: MAL's list also carries themes and demographics
 * (Isekai, Villainess, Shoujo) that AniList files as community tags instead,
 * so one of those being "MAL only" would say nothing about disagreement.
 */
export const COMPARABLE_MAL_GENRE_IDS: ReadonlySet<number> = new Set(
  Object.values(MAL_GENRE_BY_ANILIST).map((genre) => genre.id),
);

/**
 * The MAL genres for a title's AniList genres, in the `{ id, name }` shape
 * syncGenres takes. A genre AniList adds later with no entry above is dropped
 * rather than guessed at: a missing tag costs one category, a wrong one files
 * the title somewhere it does not belong.
 */
export function malGenresFor(
  genres: readonly string[] | null | undefined,
): { id: number; name: string }[] {
  const seen = new Set<number>();
  const out: { id: number; name: string }[] = [];
  for (const genre of genres ?? []) {
    const mal = MAL_GENRE_BY_ANILIST[genre];
    if (!mal || seen.has(mal.id)) continue;
    seen.add(mal.id);
    out.push(mal);
  }
  return out;
}
