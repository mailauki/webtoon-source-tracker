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

/**
 * A user's own collection as the index page needs it: the row, how many
 * titles are in it, and enough covers to show what it holds.
 *
 * The covers are a preview, not the contents — the detail page is where the
 * whole thing lives.
 */
export type CollectionSummary = {
  id: number;
  name: string;
  description: string | null;
  itemCount: number;
  /** Cover URLs of the first few titles, in shelf order. Nulls dropped. */
  covers: string[];
};

/** How many covers the index card shows. */
export const SUMMARY_COVER_COUNT = 4;

/**
 * Reduces a collection to what its card on the index needs.
 *
 * Ordering matches hydrateCollection, so the covers here are the same titles,
 * in the same order, as the first row of the detail page — a card that
 * previewed a different four would read as a different collection.
 */
export function summariseCollection(
  collection: RawCollection,
): CollectionSummary {
  const ordered = [...collection.collection_items].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    itemCount: ordered.length,
    covers: ordered
      .map((item) => item.media_titles.main_picture_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, SUMMARY_COVER_COUNT),
  };
}

/**
 * The next position to write for a title appended to a collection.
 *
 * Positions are spaced by ten so a title can be slipped between two others by
 * hand without renumbering the shelf. An empty collection starts at ten rather
 * than zero, leaving room to insert something ahead of the first item.
 */
export function nextPosition(positions: number[]): number {
  if (positions.length === 0) return 10;
  return Math.max(...positions) + 10;
}

/**
 * A collection reduced to what the two "file this title" surfaces need: the
 * library card's menu and the entry page's section.
 *
 * Declared here rather than in `collections.ts` so client components can name
 * the type without importing a `server-only` module — the type is erased at
 * build time, but the test runner still follows the import at runtime.
 */
export type CollectionTarget = {
  id: number;
  name: string;
  titleIds: number[];
  /**
   * The item rows behind `titleIds`, when the caller needs to remove one.
   *
   * Optional because the library card's menu only ever adds, and asking for
   * ids it would throw away would widen the query sitting behind every card
   * on the shelf. The entry page, which can remove, asks for them.
   */
  items?: { id: number; titleId: number }[];
};

/**
 * The collections worth offering for one title, for the card menu.
 *
 * A collection that already holds it comes back as `has: true` rather than
 * being dropped: the menu shows it ticked and disabled, so "is this filed
 * anywhere" is answerable without opening each collection. Dropping it would
 * make a collection that has the title and a collection that does not exist
 * look identical.
 */
export function collectionsForTitle(
  targets: CollectionTarget[],
  titleId: number,
): { id: number; name: string; has: boolean }[] {
  return targets.map((target) => ({
    id: target.id,
    name: target.name,
    has: target.titleIds.includes(titleId),
  }));
}

/**
 * The membership of one title across the viewer's collections, for the entry
 * page's section.
 *
 * Where `collectionsForTitle` answers "which of these can I add it to", this
 * answers "which is it in, and by which item" — removing needs the
 * collection_items id, which the menu never has to know because it only adds.
 *
 * Every collection comes back, in or out, so the section can render a stable
 * order: a collection does not jump position when the title goes into it.
 */
export function collectionMembership(
  targets: CollectionTarget[],
  titleId: number,
): { id: number; name: string; itemId: number | null }[] {
  return targets.map((target) => ({
    id: target.id,
    name: target.name,
    itemId: target.items?.find((item) => item.titleId === titleId)?.id ?? null,
  }));
}
