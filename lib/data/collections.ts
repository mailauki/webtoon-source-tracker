import "server-only";

import {
  hydrateCollection,
  type CollectionTarget,
  summariseCollection,
  type Collection,
  type CollectionSummary,
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
  CollectionSummary,
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

// ---------------------------------------------------------------------------
// The viewer's own collections
// ---------------------------------------------------------------------------
//
// Everything below reads user-owned rows: a non-null owner_id, which RLS
// already narrows to the caller. The `not("owner_id", "is", null)` filters are
// therefore about shape, not access — they keep curated rows off a page that
// means "yours", the mirror of the `is("owner_id", null)` above.

/**
 * Every collection the viewer has made, newest first.
 *
 * Ordered by created_at rather than `sort_order`: that column is the editorial
 * running order of /discover, and a user has no way to set it. Newest first
 * means a collection just made is where it was left.
 */
export async function getMyCollections(): Promise<CollectionSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .select(COLLECTION_SELECT)
    .not("owner_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load your collections: ${error.message}`);

  return ((data ?? []) as unknown as RawCollection[]).map(summariseCollection);
}

/**
 * One of the viewer's own collections, with everything in it.
 *
 * Returns null when the id does not exist or belongs to someone else — RLS
 * makes those indistinguishable, which is what we want: a wrong id and
 * someone else's id both 404 rather than confirming existence. A curated
 * collection reached by id 404s here too, for the same reason its page is
 * under /discover: it is not the viewer's to edit.
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
 * The viewer's library, reduced to what the "add titles" picker needs.
 *
 * Deliberately not getLibrary(): that query carries every entry's sources and
 * progress so the grid can filter on them, none of which a picker shows. This
 * is the same rows, narrowed to a name and a cover.
 */
export async function getLibraryTitles() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_entries")
    .select(
      `id, media_titles!inner ( id, title, main_picture_url )`,
    )
    .order("mal_updated_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(`Failed to load your library: ${error.message}`);

  return (data ?? []) as unknown as {
    id: number;
    media_titles: { id: number; title: string; main_picture_url: string | null };
  }[];
}

export type LibraryTitle = Awaited<ReturnType<typeof getLibraryTitles>>[number];

/**
 * The viewer's collections, reduced to what the card menu and the entry page
 * need to file a title.
 *
 * Deliberately not `getMyCollections()`: that carries each collection's cover
 * preview for the index, none of which these surfaces show. This is the same
 * rows narrowed to a name and its membership.
 *
 * `withItemIds` is opt-in because the entry page can remove as well as add,
 * and removing needs the collection_items id. The library shelf only ever
 * adds, so it does not pay for ids it would throw away on every card.
 */
export async function getCollectionTargets({
  withItemIds = false,
}: { withItemIds?: boolean } = {}): Promise<CollectionTarget[]> {
  const supabase = await createClient();

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
