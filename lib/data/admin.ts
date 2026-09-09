import "server-only";

import { sortTags, type Tag } from "@/lib/data/tag-items";
import {
  summariseCollection,
  type CollectionSummary,
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
 * Every curated collection, retired ones included.
 *
 * Deliberately does NOT filter is_active, unlike getCuratedShelves() in
 * lib/data/collections.ts. Hiding a retired collection from the person who
 * retired it would leave no way to bring it back — the admin list is the one
 * place a retired collection must stay visible so it can be reactivated.
 */
export async function getAllCuratedCollections(): Promise<CollectionSummary[]> {
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

  return ((data ?? []) as unknown as RawCollection[]).map(summariseCollection);
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
