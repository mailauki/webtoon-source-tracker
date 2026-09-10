import "server-only";

import { sortTags, type Tag } from "@/lib/data/tag-items";
import {
  hydrateCollection,
  summariseCollection,
  type Collection,
  type CollectionSummary,
  type CollectionTitle,
  type RawCollection,
} from "@/lib/data/collection-items";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin-only reads, for the `/admin` shell and the pages under it.
 *
 * Every query here uses the request-scoped (RLS-enforced) client, same as
 * `lib/data/collections.ts` and `lib/data/tags.ts` — nothing here needs the
 * service-role client. That is deliberate: `verifyAdmin()` in the layout is
 * the page-level gate, but RLS (`private.is_admin()`) is what actually
 * decides whether these rows come back at all, so a forged request without
 * the layout in front of it still gets nothing.
 */

const COLLECTION_SELECT = `
  id,
  slug,
  name,
  description,
  is_active,
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

/**
 * A curated collection as the admin list needs it.
 *
 * `CollectionSummary` is the reader-facing shape and deliberately drops the
 * slug and `is_active` — /discover only ever shows live shelves, and their
 * URLs come from the route it is already on. The admin list needs both: the
 * retired ones are shown here (see below), and the slug is the one thing
 * about a curated collection that cannot be changed after the fact, so it
 * has to be visible before somebody relies on it.
 */
export type AdminCollectionSummary = CollectionSummary & {
  slug: string | null;
  isActive: boolean;
};

/**
 * Every curated collection, retired ones included.
 *
 * Deliberately does NOT filter is_active, unlike getCuratedShelves() in
 * lib/data/collections.ts. Hiding a retired collection from the person who
 * retired it would leave no way to bring it back — the admin list is the one
 * place a retired collection must stay visible so it can be reactivated.
 */
export async function getAllCuratedCollections(): Promise<
  AdminCollectionSummary[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .select(COLLECTION_SELECT)
    .is("owner_id", null)
    .order("sort_order")
    .order("name");

  if (error) {
    throw new Error(`Failed to load collections: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as (RawCollection & {
    is_active: boolean;
  })[];

  return rows.map((row) => ({
    ...summariseCollection(row),
    slug: row.slug,
    isActive: row.is_active,
  }));
}

/**
 * One curated collection with its items, retired ones included.
 *
 * The admin twin of getCuratedCollection(): keyed on the surrogate id rather
 * than the slug, because the admin list links by id (a slug is stable for
 * readers, but the admin page has the row in hand), and unfiltered by
 * is_active for the same reason getAllCuratedCollections is.
 *
 * `.is("owner_id", null)` is what keeps this away from a user's own
 * collection. RLS would let an admin read their own private collection like
 * any other user, so without this filter an admin could open one of their own
 * collections under /admin and be offered curated-only writes that RLS would
 * then refuse. Filtering here turns that into a clean 404.
 *
 * The empty `tracked` map is deliberate: `entryId` answers "does the viewer
 * track this", which is a reader question. On the admin page every item is
 * already in the catalog by definition, so the field is uniformly null.
 */
export async function getCuratedCollectionForAdmin(
  id: number,
): Promise<(Collection & { isActive: boolean }) | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .select(COLLECTION_SELECT)
    .eq("id", id)
    .is("owner_id", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to load collection: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as RawCollection & { is_active: boolean };

  return { ...hydrateCollection(row, new Map()), isActive: row.is_active };
}

/**
 * Every tag, each carrying how many catalog titles currently wear it.
 *
 * The count uses PostgREST's count-on-embedded-resource syntax
 * (`title_tags(count)`) rather than a separate query per tag. Verified from
 * the PostgREST resource-embedding docs, NOT against a live query — this
 * project's tags/title_tags tables exist only in the migration files as of
 * this task, so there was no seeded database to confirm the response shape
 * against. PostgREST returns that embed as a one-element array,
 * `[{ count: number }]`, which is why the mapping below reads
 * `row.title_tags[0]?.count`. If tag-supporting migrations have not been
 * applied where this runs, this will surface as a normal Postgres error
 * (missing relation), not a silent miscount.
 *
 * The count is intentionally unfiltered by owner_id: today every title_tags
 * row is curated (owner_id is null — see the migration), so an unfiltered
 * count and a curated-only count are the same number. If private per-user
 * tags land later, this count would need `title_tags!inner(count)` with an
 * owner_id filter to keep meaning "how many titles carry the curated tag,"
 * and that is a real follow-up, not something silently correct today.
 */
export async function getAllTags(): Promise<(Tag & { titleCount: number })[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("tags").select(`
    id, slug, name, description, kind, mal_genre_id, sort_order, is_active,
    title_tags(count)
  `);

  if (error) {
    throw new Error(`Failed to load tags: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as (Tag & {
    title_tags: { count: number }[];
  })[];

  const tags = sortTags(rows) as typeof rows;

  return tags.map(({ title_tags, ...tag }) => ({
    ...tag,
    titleCount: title_tags?.[0]?.count ?? 0,
  }));
}

/**
 * The three counts the admin index shows.
 *
 * Three small queries rather than one large one: `head: true, count: "exact"`
 * asks Postgres for a row count without shipping any rows back, which is
 * cheaper than fetching every collection/tag/title_tags row just to call
 * `.length` on it — and the three numbers don't need to be transactionally
 * consistent with each other for an index page.
 */
export async function getAdminCounts(): Promise<{
  collections: number;
  tags: number;
  taggedTitles: number;
}> {
  const supabase = await createClient();

  const [collections, tags, taggedTitles] = await Promise.all([
    supabase
      .from("collections")
      .select("id", { count: "exact", head: true })
      .is("owner_id", null),
    supabase.from("tags").select("id", { count: "exact", head: true }),
    supabase
      .from("title_tags")
      .select("id", { count: "exact", head: true })
      .is("owner_id", null),
  ]);

  if (collections.error) {
    throw new Error(`Failed to count collections: ${collections.error.message}`);
  }
  if (tags.error) {
    throw new Error(`Failed to count tags: ${tags.error.message}`);
  }
  if (taggedTitles.error) {
    throw new Error(`Failed to count tagged titles: ${taggedTitles.error.message}`);
  }

  return {
    collections: collections.count ?? 0,
    tags: tags.count ?? 0,
    taggedTitles: taggedTitles.count ?? 0,
  };
}

/**
 * One tag by id, retired ones included.
 *
 * getTagBySlug() in lib/data/tags.ts cannot stand in: it filters
 * `is_active` on purpose, so a retired tag is a 404 for readers — which
 * would make the admin page for retiring a tag 404 the moment it worked.
 */
export async function getTagForAdmin(id: number): Promise<Tag | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(
      "id, slug, name, description, kind, mal_genre_id, sort_order, is_active",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load tag: ${error.message}`);
  return (data as Tag) ?? null;
}

/**
 * Every catalog title carrying one tag, for the tag's admin page.
 *
 * Distinct from getTitlesForTag() only in that it returns the row ids the
 * remove control needs — untagTitle keys on (tag_id, title_id), so this
 * actually returns the same catalog rows; the reason it lives here is that
 * the reader-facing one is reached from a page that filters retired tags out
 * first, and this one must work for a retired tag too.
 */
export async function getTaggedTitlesForAdmin(
  tagId: number,
): Promise<CollectionTitle[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("title_tags")
    .select(
      `media_titles!inner (
         id, mal_media_id, title, title_en, main_picture_url,
         mal_media_kind, num_chapters, mal_status
       )`,
    )
    .eq("tag_id", tagId)
    .is("owner_id", null);

  if (error) throw new Error(`Failed to load titles: ${error.message}`);

  return ((data ?? []) as unknown as { media_titles: CollectionTitle }[])
    .map((row) => row.media_titles)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** How many catalog matches a picker will offer for one query. */
export const CATALOG_SEARCH_LIMIT = 25;

/**
 * Catalog titles matching a search term, for the two admin pickers.
 *
 * The catalog and nothing but: there is deliberately no MyAnimeList search
 * behind these pickers, so a title that has never been synced by anybody
 * cannot be put on a shelf or given a tag. That is a known gap recorded as
 * deferred work, not an oversight — importing from MAL is a write to a third
 * party with its own rate limits and failure modes, and it needs its own
 * design rather than being smuggled in behind a search box.
 *
 * The search runs on the server rather than filtering rows already sent, the
 * opposite of AddTitlesDialog's choice. That dialog filters a viewer's
 * library, which is at most a few hundred rows the page already had; the
 * catalog is every title anybody has ever synced, and shipping it to the
 * browser to filter it there would be absurd. `media_titles_title_trgm_idx`
 * exists for exactly this query.
 *
 * An empty term returns nothing rather than the whole catalog — a picker that
 * opens onto an arbitrary 25 titles invites adding the wrong one.
 */
export async function searchCatalogTitles(
  term: string,
): Promise<CollectionTitle[]> {
  const trimmed = term.trim();
  if (trimmed === "") return [];

  const supabase = await createClient();

  // PostgREST splits an `ilike` pattern on commas when it is part of an `or`
  // filter; this is a plain filter, so the term goes through as one value and
  // needs no escaping beyond the wildcards.
  const { data, error } = await supabase
    .from("media_titles")
    .select(
      `id, mal_media_id, title, title_en, main_picture_url,
       mal_media_kind, num_chapters, mal_status`,
    )
    .ilike("title", `%${trimmed}%`)
    .order("title")
    .limit(CATALOG_SEARCH_LIMIT);

  if (error) throw new Error(`Failed to search the catalog: ${error.message}`);

  return (data ?? []) as CollectionTitle[];
}
