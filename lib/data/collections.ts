import "server-only";

import {
  hydrateCollection,
  type Collection,
  type CollectionTarget,
  type RawCollection,
} from "@/lib/data/collection-items";
import { createClient } from "@/lib/supabase/server";

/**
 * Curated collection reads, for /discover and the see-all pages under it.
 *
 * Collections come in two shapes (see the collections migration): a null
 * owner_id is a curated editorial row, a non-null one belongs to a user. Only
 * the curated ones are read here. RLS already hides other people's
 * collections, so `is("owner_id", null)` below decides *which* of the visible
 * rows this surface wants — it is not the access check.
 *
 * These use the request-scoped (RLS-enforced) client. Curated rows are
 * readable by any signed-in user under collections_select_visible, so nothing
 * here needs the admin client. Writing them does, which is why seeding lives
 * in `scripts/seed-collections.ts`.
 */

/**
 * Items and their catalog rows, in one go.
 *
 * `media_titles!inner` makes that join inner, so an item whose catalog row
 * somehow went missing drops out rather than arriving as a null every card
 * would have to defend against. It should not be reachable —
 * `collection_items.title_id` is `on delete restrict` — but the query should
 * not be the thing deciding whether it is.
 */
const COLLECTION_SELECT = `
  id,
  slug,
  name,
  description,
  collection_items (
    id,
    position,
    note,
    media_titles!inner (
      id, mal_media_id, title, title_en, main_picture_url,
      mal_media_kind, num_chapters, mal_status
    )
  )
`;

export type {
  Collection,
  CollectionItem,
  CollectionTarget,
} from "@/lib/data/collection-items";

/**
 * Catalog title id -> the viewer's own user_entries id for it.
 *
 * A separate query rather than an embed under media_titles. Nesting
 * `user_entries` inside the select above would work — RLS would narrow it to
 * the caller's own rows — but it makes every card's "do I have this" depend on
 * PostgREST resolving a reverse relationship two levels down, where this is a
 * flat indexed read of a table the user can only ever see their own rows of.
 * Collections hold a dozen titles, so the extra round trip is not the cost
 * worth optimising away.
 */
async function getTrackedEntries(): Promise<Map<number, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_entries")
    .select("id, title_id");

  // Degrade to "you track nothing": every card then offers to add its title,
  // which is wrong but recoverable — adding one already on the shelf is a
  // no-op upsert against MAL. Taking the page down over it would not be.
  if (error) return new Map();

  return new Map((data ?? []).map((row) => [row.title_id, row.id]));
}

/**
 * Every active curated collection, each trimmed to a shelf's worth of titles.
 *
 * Ordered by `sort_order` then name, which is what that column is for: the
 * editorial running order of the page. Collections with no items are dropped —
 * an empty shelf is a worse answer than no shelf.
 */
export async function getCuratedShelves(perShelf = 12): Promise<Collection[]> {
  const supabase = await createClient();

  const [{ data, error }, tracked] = await Promise.all([
    supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .is("owner_id", null)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    getTrackedEntries(),
  ]);

  if (error) throw new Error(`Failed to load collections: ${error.message}`);

  return ((data ?? []) as unknown as RawCollection[])
    .map((row) => hydrateCollection(row, tracked, perShelf))
    .filter((collection) => collection.items.length > 0);
}

/**
 * One curated collection and all of its titles, for the see-all page.
 *
 * Returns null when the slug does not exist or the collection has been
 * retired, which the page turns into a 404: `is_active` is how a curated
 * collection is withdrawn, so a retired one should stop being a page. A user's
 * own collection can never be reached here — user rows carry no slug at all.
 */
export async function getCuratedCollection(
  slug: string,
): Promise<Collection | null> {
  const supabase = await createClient();

  const [{ data, error }, tracked] = await Promise.all([
    supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .is("owner_id", null)
      .eq("is_active", true)
      .eq("slug", slug)
      .maybeSingle(),
    getTrackedEntries(),
  ]);

  if (error) throw new Error(`Failed to load collection: ${error.message}`);
  if (!data) return null;

  return hydrateCollection(data as unknown as RawCollection, tracked);
}

/**
 * The viewer's own collections, each with its titles.
 *
 * `is("owner_id", null)` is inverted here — `not("owner_id", "is", null)` —
 * rather than filtering on the user's id: RLS already narrows this to rows the
 * caller owns, so asking for "the visible rows that have an owner" is the same
 * set, without restating the identity check the policy performs.
 *
 * Ordered by name. `sort_order` exists for the editorial running order of
 * /discover and every user row shares its default, so it would order nothing
 * here.
 */
export async function getMyCollections(): Promise<Collection[]> {
  const supabase = await createClient();

  const [{ data, error }, tracked] = await Promise.all([
    supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .not("owner_id", "is", null)
      .order("name"),
    getTrackedEntries(),
  ]);

  if (error) throw new Error(`Failed to load your collections: ${error.message}`);

  // Empty ones are kept, unlike the curated shelves: a collection you just
  // made and have not filled is exactly the one you need to see.
  return ((data ?? []) as unknown as RawCollection[]).map((row) =>
    hydrateCollection(row, tracked),
  );
}

/**
 * One of the viewer's own collections.
 *
 * Keyed on the surrogate id, not a slug — user rows have no slug at all
 * (collections_shape_ck), so there is nothing else to key on. RLS is what
 * makes a guessed id safe: it matches nothing rather than returning someone
 * else's collection, which the page turns into a 404.
 */
export async function getMyCollection(id: number): Promise<Collection | null> {
  const supabase = await createClient();

  const [{ data, error }, tracked] = await Promise.all([
    supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .not("owner_id", "is", null)
      .eq("id", id)
      .maybeSingle(),
    getTrackedEntries(),
  ]);

  if (error) throw new Error(`Failed to load collection: ${error.message}`);
  if (!data) return null;

  return hydrateCollection(data as unknown as RawCollection, tracked);
}

/**
 * Just the names and membership of the viewer's collections, for the
 * "add to collection" menu on a library card.
 *
 * Deliberately not `getMyCollections()`: the menu needs to know which
 * collections already hold this title so it can show a tick rather than an
 * option that would only ever fail the unique constraint, and that is one
 * narrow read instead of every collection's full catalog join.
 */
export async function getCollectionTargets(
  { withItemIds = false }: { withItemIds?: boolean } = {},
): Promise<CollectionTarget[]> {
  const supabase = await createClient();

  // The entry page can remove as well as add, and removing needs the
  // collection_items id. The library shelf only ever adds, so it does not ask
  // for ids it would throw away.
  const select = withItemIds
    ? "id, name, collection_items ( id, title_id )"
    : "id, name, collection_items ( title_id )";

  const { data, error } = await supabase
    .from("collections")
    .select(select)
    .not("owner_id", "is", null)
    .order("name");

  // These are a shortcut; losing them should not take the page down.
  if (error) return [];

  return (
    (data ?? []) as unknown as {
      id: number;
      name: string;
      collection_items: { id?: number; title_id: number }[];
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    titleIds: row.collection_items.map((item) => item.title_id),
    items: withItemIds
      ? row.collection_items.map((item) => ({
          id: item.id!,
          titleId: item.title_id,
        }))
      : undefined,
  }));
}
