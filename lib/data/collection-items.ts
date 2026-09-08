/**
 * Shapes and ordering for curated collections.
 *
 * Kept out of `collections.ts` because that module is `server-only`: the card
 * and the shelf are client-side, and the tests need this logic directly. The
 * types are erased at build time, but the test runner still follows the
 * import at runtime — the same reason `rank-sources.ts` sits beside
 * `sources.ts`.
 */

/** A catalog row, as a collection card needs it. */
export type CollectionTitle = {
  id: number;
  mal_media_id: number;
  title: string;
  title_en: string | null;
  main_picture_url: string | null;
  mal_media_kind: string | null;
  num_chapters: number | null;
  mal_status: string | null;
};

/** One row of `collection_items`, joined to its catalog row. */
export type RawCollectionItem = {
  id: number;
  position: number;
  note: string | null;
  media_titles: CollectionTitle;
};

export type RawCollection = {
  id: number;
  slug: string | null;
  name: string;
  description: string | null;
  collection_items: RawCollectionItem[];
};

export type CollectionItem = RawCollectionItem & {
  /**
   * The viewer's `user_entries` id for this title, when they track it — not
   * the catalog id, since /entry/[id] is keyed on the entry.
   *
   * Null is the interesting case on a curated shelf: it is a title the viewer
   * does not have, which is the reason the shelf exists.
   */
  entryId: number | null;
};

export type Collection = Omit<RawCollection, "collection_items"> & {
  items: CollectionItem[];
};

/**
 * Orders a collection's items and stitches in the viewer's own entries.
 *
 * Both the ordering and the per-shelf slice happen here rather than in the
 * query. PostgREST can order and limit an embedded table, but only through its
 * `referencedTable` option, and a curated collection holds a dozen items —
 * sorting them in memory costs nothing and keeps the select readable.
 *
 * `position` is deliberately not unique (see the collections migration), so
 * ties are broken by insertion order. `id` stands in for that: the column is
 * `generated always as identity`, so a larger id is always a later row.
 *
 * `tracked` maps catalog title id -> the viewer's entry id.
 */
export function hydrateCollection(
  collection: RawCollection,
  tracked: Map<number, number>,
  limit?: number,
): Collection {
  const items = [...collection.collection_items]
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      entryId: tracked.get(item.media_titles.id) ?? null,
    }));

  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    items,
  };
}
