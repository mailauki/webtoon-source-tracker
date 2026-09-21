/**
 * Where the line between "safe" and "adult" is drawn, in one place.
 *
 * MyAnimeList rates every title `white` (safe), `gray` (may be inappropriate)
 * or `black` (adult), and `media_titles.nsfw` stores that string verbatim. This
 * module is the only thing that decides what those strings mean, so moving the
 * line — treating `gray` as safe, say — is an edit here rather than a sweep
 * through every query that filters on it.
 *
 * Deliberately not `server-only`, unlike the modules that read the catalog:
 * the settings switch is client-side and the tests need this directly, the
 * same reason `tag-items.ts` sits beside `tags.ts`.
 */

/**
 * The ratings this app treats as adult.
 *
 * `gray` is in, alongside `black`. MAL's own documentation calls it "may be
 * inappropriate for some audiences", which is exactly the audience a reader
 * who turned this switch on has put themselves in — and the search page has
 * always drawn the line in the same place (see lib/mal/endpoints.ts), so a
 * title filtered out of a search would otherwise still arrive on a shelf.
 */
export const MATURE_RATINGS: ReadonlySet<string> = new Set(["gray", "black"]);

/** Anything carrying MAL's rating: a live API node, or a stored catalog row. */
export type Rated = { nsfw?: string | null };

/**
 * Is this title adult-rated?
 *
 * An unrated title (`null`, or a rating this version does not know) reads as
 * safe. That is the deliberate direction, and it is worth being explicit about
 * why, because the cautious-looking alternative is the wrong one here:
 *
 *   - Every catalog row written before the rating column existed is null, and
 *     they are filled in by a paced per-title backfill rather than all at
 *     once. Treating null as adult would empty the library of anyone whose
 *     titles the backfill had not reached yet — which reads as lost data, not
 *     as caution.
 *   - The rating is a MAL field, and MAL can add a value. A rating string this
 *     version has never heard of is not evidence of anything.
 *
 * Where the safe direction genuinely matters — asking MAL for search results
 * — it is enforced by the request itself (`nsfw: false`) rather than by
 * guessing here; see searchManga.
 */
export function isMature(node: Rated | null | undefined): boolean {
  return MATURE_RATINGS.has(node?.nsfw ?? "");
}

/**
 * Drop the adult-rated rows from a list.
 *
 * Takes an accessor rather than assuming a shape: the rating hangs off
 * `media_titles` on a library row and off a collection item's embedded title,
 * and threading the accessor through keeps one predicate serving both instead
 * of one wrapper per table.
 *
 * `hide` is a parameter rather than something the caller branches on, so the
 * decision reads the same at every call site and the "show everything" path
 * returns the array untouched rather than a needless copy.
 */
export function screenMature<T>(
  rows: T[],
  hide: boolean,
  ratingOf: (row: T) => Rated | null | undefined,
): T[] {
  if (!hide) return rows;
  return rows.filter((row) => !isMature(ratingOf(row)));
}
