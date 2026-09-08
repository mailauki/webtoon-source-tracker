import "server-only";

import {
  hydrateCollection,
  type Collection,
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

export type { Collection, CollectionItem } from "@/lib/data/collection-items";

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
