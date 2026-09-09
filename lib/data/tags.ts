import "server-only";

import type { CollectionTitle } from "@/lib/data/collection-items";
import { sortTags, type Tag } from "@/lib/data/tag-items";
import { createClient } from "@/lib/supabase/server";

/**
 * Tag reads.
 *
 * Every signed-in user may select from `tags` under tags_select_all, so these
 * use the request-scoped client. Writing requires private.is_admin(), which is
 * why the writes live in app/actions/tags.ts and not here.
 *
 * `is_active` is filtered here rather than in a policy: it is presentation,
 * not authorization — the same call `lib/data/collections.ts` makes.
 */

const TAG_COLUMNS =
  "id, slug, name, description, kind, mal_genre_id, sort_order, is_active";

export async function getActiveTags(): Promise<Tag[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(TAG_COLUMNS)
    .eq("is_active", true);

  if (error) throw new Error(`Failed to load tags: ${error.message}`);
  return sortTags((data ?? []) as Tag[]);
}

/**
 * One active tag by slug, for /discover/tag/[slug].
 *
 * Returns null for an unknown slug and for a retired tag alike, which the page
 * turns into a 404: is_active is how a tag is withdrawn, so a retired one
 * should stop being a page.
 */
export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(TAG_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load tag: ${error.message}`);
  return (data as Tag) ?? null;
}

/** Active tags on one title, for the entry page's chips. */
export async function getTagsForTitle(titleId: number): Promise<Tag[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("title_tags")
    .select(`tags!inner ( ${TAG_COLUMNS} )`)
    .eq("title_id", titleId)
    .is("owner_id", null);

  // Chips are a garnish; losing them should not take the entry page down.
  if (error) return [];

  return sortTags(
    ((data ?? []) as unknown as { tags: Tag }[])
      .map((row) => row.tags)
      .filter((tag) => tag.is_active),
  );
}

/**
 * Every catalog title carrying one tag.
 *
 * `media_titles!inner` makes the join inner, so a link whose catalog row went
 * missing drops out rather than arriving as a null every card must defend
 * against — the same shape COLLECTION_SELECT uses.
 */
export async function getTitlesForTag(
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
