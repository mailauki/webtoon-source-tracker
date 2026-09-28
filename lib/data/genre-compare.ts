import { COMPARABLE_MAL_GENRE_IDS, malGenresFor } from "@/lib/anilist/genres";

/** Where MyAnimeList and AniList agree and differ on one title's genres. */
export type GenreComparison = {
  both: string[];
  malOnly: string[];
  anilistOnly: string[];
};

/**
 * Compares one title's genres across the two sites, by MAL genre id.
 *
 * Only genres both sites *can* have are compared — see
 * COMPARABLE_MAL_GENRE_IDS. MAL lists themes and demographics in the same
 * array as its genres, and AniList has no genre for those, so without the
 * filter nearly every title would report a pile of "MAL only" differences
 * that are really just two vocabularies.
 *
 * Names are MAL's, since those are the names the app's tags carry: AniList's
 * "Thriller" reads as "Suspense", and matches MAL's Suspense.
 *
 * Null when either site has not answered, so a missing answer is never read
 * as a site having no genres at all.
 */
export function compareGenres(
  mal: readonly { id: number; name: string }[] | null | undefined,
  anilist: readonly string[] | null | undefined,
): GenreComparison | null {
  if (!mal || !anilist) return null;

  const malById = new Map(
    mal
      .filter((genre) => COMPARABLE_MAL_GENRE_IDS.has(genre.id))
      .map((genre) => [genre.id, genre.name]),
  );
  const anilistById = new Map(
    malGenresFor(anilist).map((genre) => [genre.id, genre.name]),
  );

  const both: string[] = [];
  const malOnly: string[] = [];
  for (const [id, name] of malById) {
    (anilistById.has(id) ? both : malOnly).push(name);
  }
  const anilistOnly = [...anilistById]
    .filter(([id]) => !malById.has(id))
    .map(([, name]) => name);

  return { both, malOnly, anilistOnly };
}
