import "server-only";

import { hidesMatureTitles } from "@/lib/auth/dal";
import {
  hydrateCollection,
  type CollectionTarget,
  type Collection,
  type RawCollection,
  type RawTrackedRow,
  type TrackedEntry,
} from "@/lib/data/collection-items";
import { screenMature } from "@/lib/data/nsfw";
import { readAllRows } from "@/lib/data/pagination";
import { createClient } from "@/lib/supabase/server";

/**
 * Collection reads, for /discover and the see-all pages under it.
 *
 * Collections come in two shapes (see the collections migration): a null
 * owner_id is a curated editorial row, a non-null one belongs to a user.
 * /discover shows both, but they are read separately: curated rows first, the
 * viewer's own further down. RLS already hides other people's collections, so
 * the owner_id filters below decide *which* of the visible rows each read
 * wants — they are not the access check.
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
      mal_media_kind, num_chapters, mal_status, nsfw
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
 * A collection with its adult-rated titles taken out.
 *
 * Applied to the raw PostgREST rows, before `hydrateCollection` or
 * `summariseCollection` sees them, so that everything downstream of those two
 * agrees: the shelf, the item count and the cover preview on the index card
 * are all derived from the same narrowed list. Filtering afterwards would have
 * left a card reading "14 titles" above a shelf of eleven.
 *
 * `hydrateCollection` and `summariseCollection` stay pure and rating-blind —
 * they are shared with surfaces that have no user to have a preference (see
 * lib/data/admin.ts) and are tested on their own.
 */
function screenCollection(row: RawCollection, hideMature: boolean): RawCollection {
  if (!hideMature) return row;

  return {
    ...row,
    collection_items: screenMature(
      row.collection_items,
      true,
      (item) => item.media_titles,
    ),
  };
}

/**
 * Catalog title id -> what the viewer already knows about that title.
 *
 * A separate query rather than an embed under media_titles. Nesting
 * `user_entries` inside the select above would work — RLS would narrow it to
 * the caller's own rows — but it makes every card's "do I have this" depend on
 * PostgREST resolving a reverse relationship two levels down, where this is a
 * flat indexed read of a table the user can only ever see their own rows of.
 * Collections hold a dozen titles, so the extra round trip is not the cost
 * worth optimising away.
 *
 * It carries the status and source slugs as well as the entry id, because the
 * category pages filter on them (see CollectionFilters). That is one embedded
 * join more than "do I have this" strictly needs, and it is still one query:
 * the alternative was a second round trip per page for data this one is
 * already visiting the right rows to collect.
 */
export async function getTrackedEntries(): Promise<Map<number, TrackedEntry>> {
  const supabase = await createClient();

  // Paged: this answers "do I already have this" for every card on the page,
  // and a row lost to `max_rows` reads as a confident no.
  let rows;
  try {
    rows = await readAllRows(
      (from, to) =>
        supabase
          .from("user_entries")
          .select(
            "id, title_id, list_status, entry_sources ( sources ( slug ) )",
            { count: "exact" },
          )
          // Archived titles are not tracked any more, so a collection card
          // should offer to add them again rather than showing them as owned.
          .is("archived_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      "tracked titles",
    );
  } catch {
    // Degrade to "you track nothing": every card then offers to add its title,
    // which is wrong but recoverable — adding one already on the shelf is a
    // no-op upsert against MAL. Taking the page down over it would not be.
    return new Map();
  }

  return new Map(
    (rows as unknown as RawTrackedRow[]).map((row) => [
      row.title_id,
      {
        entryId: row.id,
        listStatus: row.list_status,
        // A source with no slug is a user's own custom one. It cannot be
        // filtered by — the chips are built from the slug list — so it is
        // dropped here rather than carried as a null nobody can match.
        sourceSlugs: (row.entry_sources ?? [])
          .map((es) => es.sources?.slug)
          .filter((slug): slug is string => Boolean(slug)),
      },
    ]),
  );
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

  const [{ data, error }, tracked, hideMature] = await Promise.all([
    supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .is("owner_id", null)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    getTrackedEntries(),
    hidesMatureTitles(),
  ]);

  if (error) throw new Error(`Failed to load collections: ${error.message}`);

  return ((data ?? []) as unknown as RawCollection[])
    .map((row) => hydrateCollection(screenCollection(row, hideMature), tracked, perShelf))
    // Already dropped empty collections; now it also drops one left empty by
    // the switch, which is the right reading — a shelf of nothing but adult
    // titles should disappear for someone who asked not to see them, not
    // linger as a heading with no covers.
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

  const [{ data, error }, tracked, hideMature] = await Promise.all([
    supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .is("owner_id", null)
      .eq("is_active", true)
      .eq("slug", slug)
      .maybeSingle(),
    getTrackedEntries(),
    hidesMatureTitles(),
  ]);

  if (error) throw new Error(`Failed to load collection: ${error.message}`);
  if (!data) return null;

  // Still a page, even if the switch empties it. The collection exists and its
  // description still says what it is about; 404ing here would claim it does
  // not, which is a different and untrue thing.
  return hydrateCollection(
    screenCollection(data as unknown as RawCollection, hideMature),
    tracked,
  );
}

// ---------------------------------------------------------------------------
// The viewer's own collections
// ---------------------------------------------------------------------------
//
// Everything below reads user-owned rows: a non-null owner_id, which RLS
// already narrows to the caller. The `not("owner_id", "is", null)` filters are
// therefore about shape, not access — they keep curated rows off the shelves
// that mean "yours", the mirror of the `is("owner_id", null)` above.

/**
 * Every collection the viewer has made, newest first, each trimmed to a
 * shelf's worth of titles — the same shape `getCuratedShelves` returns, so
 * /discover renders both kinds with one shelf component.
 *
 * Ordered by created_at rather than `sort_order`: that column is the editorial
 * running order of the curated shelves, and a user has no way to set it.
 * Newest first means a collection just made is where it was left.
 */
export async function getMyShelves(perShelf = 12): Promise<Collection[]> {
  const supabase = await createClient();

  const [{ data, error }, tracked, hideMature] = await Promise.all([
    supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .not("owner_id", "is", null)
      .order("created_at", { ascending: false }),
    getTrackedEntries(),
    hidesMatureTitles(),
  ]);

  if (error) throw new Error(`Failed to load your collections: ${error.message}`);

  // Empty collections are kept, unlike a curated shelf: these are things the
  // user made, and one of them vanishing — because it is new, or because the
  // mature switch emptied it — would read as deletion.
  return ((data ?? []) as unknown as RawCollection[]).map((row) =>
    hydrateCollection(screenCollection(row, hideMature), tracked, perShelf),
  );
}

/**
 * One of the viewer's own collections, with everything in it.
 *
 * Returns null when the id does not exist or belongs to someone else — RLS
 * makes those indistinguishable, which is what we want: a wrong id and
 * someone else's id both 404 rather than confirming existence. A curated
 * collection reached by id 404s here too: it is not the viewer's to edit, and
 * its page is /discover/[slug].
 */
export async function getMyCollection(id: number): Promise<Collection | null> {
  const supabase = await createClient();

  const [{ data, error }, tracked, hideMature] = await Promise.all([
    supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .not("owner_id", "is", null)
      .eq("id", id)
      .maybeSingle(),
    getTrackedEntries(),
    hidesMatureTitles(),
  ]);

  if (error) throw new Error(`Failed to load collection: ${error.message}`);
  if (!data) return null;

  return hydrateCollection(
    screenCollection(data as unknown as RawCollection, hideMature),
    tracked,
  );
}

/**
 * The viewer's library, reduced to what the "add titles" picker needs.
 *
 * Deliberately not getLibrary(): that query carries every entry's sources and
 * progress so the grid can filter on them, none of which a picker shows. This
 * is the same rows, narrowed to a name and a cover.
 *
 * Paged for the same reason getLibrary is: the picker's whole job is to let
 * you find a title you own, and a row cut off at `max_rows` would present as
 * a title you do not. See lib/data/pagination.ts.
 */
export async function getLibraryTitles() {
  const supabase = await createClient();

  const hideMature = await hidesMatureTitles();

  const rows = await readAllRows(
    (from, to) =>
      supabase
        .from("user_entries")
        .select(
          `id, media_titles!inner ( id, title, title_en, main_picture_url, nsfw )`,
          {
            count: "exact",
          },
        )
        .is("archived_at", null)
        .order("mal_updated_at", { ascending: false, nullsFirst: false })
        // A unique tiebreak, so a page boundary cannot fall inside a run of
        // rows that share an update stamp.
        .order("id", { ascending: true })
        .range(from, to),
    "your library",
  );

  const titles = rows as unknown as {
    id: number;
    media_titles: {
      id: number;
      title: string;
      title_en: string | null;
      main_picture_url: string | null;
      nsfw: string | null;
    };
  }[];

  // The picker offers titles from the user's own shelf, so it follows the same
  // switch the shelf does: a title hidden from the library that still turned up
  // here would be the one place the setting leaked.
  return screenMature(titles, hideMature, (row) => row.media_titles);
}

export type LibraryTitle = Awaited<ReturnType<typeof getLibraryTitles>>[number];

/**
 * The viewer's collections, reduced to what the card menu and the entry page
 * need to file a title.
 *
 * Deliberately not `getMyShelves()`: that carries each collection's titles
 * for the shelves on /discover, none of which these surfaces show. This is the same
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
