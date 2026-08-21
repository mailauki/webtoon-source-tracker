/**
 * Ranking for the card context menu's "add a source" shortcuts.
 *
 * Kept out of `sources.ts` because that module is `server-only`: this is pure
 * logic the client bundle and the tests both need.
 */

/**
 * A row of the source catalog, as the client sees it.
 *
 * Declared here rather than in `sources.ts` so client components can name the
 * type without importing a `server-only` module — the type is erased at build
 * time, but the test runner still follows the import at runtime.
 */
export type Source = {
  id: number;
  slug: string | null;
  name: string;
  base_url: string | null;
  logo_url: string | null;
  owner_id: string | null;
  parent_slug: string | null;
  sort_order: number | null;
};

/** Enough to cover habit without turning the submenu into a scroll. */
export const TOP_SOURCE_LIMIT = 5;

type Attachment = {
  source_id: number;
  sources: { id: number; name: string } | null;
};

export type RankedSource = { id: number; name: string; count: number };

/**
 * The user's most-used sources, most-attached first.
 *
 * Ties break by name so the submenu does not reshuffle between loads for the
 * many sources a user has attached exactly once.
 */
export function rankSources(rows: Attachment[]): RankedSource[] {
  const counts = new Map<number, RankedSource>();

  for (const row of rows) {
    // The join is nullable — a custom source the user deleted comes back null.
    if (!row.sources) continue;

    const seen = counts.get(row.sources.id);
    if (seen) seen.count += 1;
    else counts.set(row.sources.id, { ...row.sources, count: 1 });
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP_SOURCE_LIMIT);
}
