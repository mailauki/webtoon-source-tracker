import type { LibraryRow } from "@/lib/data/entries";

/**
 * How a stored filter preference becomes a chip selection.
 *
 * Two stored values mean "show everything" and must not be confused with each
 * other anywhere else in the code:
 *
 *   - null     — the user has never chosen; no row, or no value for this chip
 *   - `all`    — the user explicitly asked to see everything
 *
 * Both render as the All chip, so this function flattens them to the same
 * empty string. They stay distinct in the database because only the second
 * survives a future change to what the default should be.
 */

/** The value stored when the user explicitly asks to see everything. */
export const ALL = "all";

/**
 * The chip value to render as active: a status/source slug, or "" for All.
 */
export function resolveActiveChip(saved: string | null | undefined): string {
  return !saved || saved === ALL ? "" : saved;
}

/* ------------------------------------------------------------------------ */
/* Sort                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * How the grid is ordered.
 *
 * Unlike the filters there is no "off" state — a grid is always in some order —
 * so a missing preference resolves to DEFAULT_SORT rather than to a sentinel.
 *
 * The key and the direction are one stored value (`added:desc`) because they
 * are one choice: "oldest first" is a sort, not a modifier applied to one.
 */

export type SortKey = "updated" | "added" | "progress" | "title";
export type SortDirection = "asc" | "desc";
export type Sort = { key: SortKey; direction: SortDirection };

/** Matches the ordering the server query already applies. */
export const DEFAULT_SORT: Sort = { key: "updated", direction: "desc" };

/**
 * The labels for each key, and what its two directions mean in that key's own
 * terms. "A→Z" and "Newest first" are the same `asc`/`desc` underneath, but
 * naming them generically would leave the user to work out which end of a date
 * "ascending" is.
 */
export const SORT_OPTIONS: {
  key: SortKey;
  label: string;
  asc: string;
  desc: string;
}[] = [
  { key: "updated", label: "Date updated", asc: "Oldest", desc: "Newest" },
  { key: "added", label: "Date added", asc: "Oldest", desc: "Newest" },
  { key: "progress", label: "Progress", asc: "Least", desc: "Most" },
  { key: "title", label: "Title", asc: "A–Z", desc: "Z–A" },
];

const SORT_KEYS = new Set<string>(SORT_OPTIONS.map((o) => o.key));

/**
 * Parse a stored `key:direction` pair.
 *
 * Anything unrecognised falls back to the default: a preference written by a
 * version of this app that offered a key this one dropped should quietly sort
 * by the default, not throw on render.
 */
export function resolveSort(saved: string | null | undefined): Sort {
  if (!saved) return DEFAULT_SORT;

  const [key, direction] = saved.split(":");
  if (!SORT_KEYS.has(key)) return DEFAULT_SORT;
  if (direction !== "asc" && direction !== "desc") return DEFAULT_SORT;

  return { key: key as SortKey, direction };
}

/** Serialise for storage. Inverse of resolveSort. */
export function serializeSort(sort: Sort): string {
  return `${sort.key}:${sort.direction}`;
}

/** The title shown on the card, so sorting matches what the user reads. */
function titleOf(row: LibraryRow): string {
  return row.media_titles?.title ?? "";
}

/**
 * Percent complete, or null when it cannot be known.
 *
 * `num_chapters` is 0 or null for anything still publishing, which is most of
 * a webtoon library. Those have a chapter count but no percentage, and
 * treating that as 0% would bury an actively-read title below a plan-to-read
 * one — so it is null here and sorted to the end, in both directions.
 */
function progressOf(row: LibraryRow): number | null {
  const total = row.media_titles?.num_chapters;
  if (!total) return null;
  return Math.min(100, (row.num_chapters_read / total) * 100);
}

/** Epoch millis, or null for a date the row does not carry. */
function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Compare two rows on a key, ascending. Null-ish values sort last regardless
 * of direction (see `sortEntries`), so this only orders present values.
 */
function compare(a: LibraryRow, b: LibraryRow, key: SortKey): number {
  switch (key) {
    case "title":
      // Locale-aware and case-insensitive: a plain `<` puts "Zeta" before
      // "apple" via char codes, which is not alphabetical to a reader.
      return titleOf(a).localeCompare(titleOf(b), undefined, {
        sensitivity: "base",
      });
    case "progress":
      return (progressOf(a) ?? 0) - (progressOf(b) ?? 0);
    case "added":
      return (timeOf(a.created_at) ?? 0) - (timeOf(b.created_at) ?? 0);
    case "updated":
      return (timeOf(a.mal_updated_at) ?? 0) - (timeOf(b.mal_updated_at) ?? 0);
  }
}

/** Whether a row has no value for this key, and so belongs at the end. */
function isMissing(row: LibraryRow, key: SortKey): boolean {
  switch (key) {
    case "title":
      return titleOf(row) === "";
    case "progress":
      return progressOf(row) === null;
    case "added":
      return timeOf(row.created_at) === null;
    case "updated":
      return timeOf(row.mal_updated_at) === null;
  }
}

/**
 * Order rows for display.
 *
 * Returns a new array — the caller's rows come from the server component and
 * must not be mutated, since React may render them again unchanged.
 *
 * Rows missing a value for the active key always sort last, in both
 * directions. Flipping to ascending is a request to see the least-read or
 * oldest titles first, not to fill the top of the grid with rows that have no
 * value at all.
 */
export function sortEntries(entries: LibraryRow[], sort: Sort): LibraryRow[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...entries].sort((a, b) => {
    const aMissing = isMissing(a, sort.key);
    const bMissing = isMissing(b, sort.key);
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (aMissing) return 0;

    return compare(a, b, sort.key) * factor;
  });
}
