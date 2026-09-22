import "server-only";

import { hidesMatureTitles } from "@/lib/auth/dal";
import type { CollectionTitle } from "@/lib/data/collection-items";
import { screenMature } from "@/lib/data/nsfw";
import { readAllRows } from "@/lib/data/pagination";
import { isExplicitKind, sortTags, type Tag } from "@/lib/data/tag-items";
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

  const [{ data, error }, hideMature] = await Promise.all([
    supabase.from("tags").select(TAG_COLUMNS).eq("is_active", true),
    hidesMatureTitles(),
  ]);

  if (error) throw new Error(`Failed to load tags: ${error.message}`);

  const tags = (data ?? []) as Tag[];

  // The explicit kind rides the same switch the titles do. Under the age
  // floor that is not optional; for a confirmed adult who turned hiding on,
  // the category goes too — the same reading the search switch and the
  // library menu take, where a category the app is not currently offering is
  // absent rather than present-and-empty.
  return sortTags(
    hideMature ? tags.filter((tag) => !isExplicitKind(tag.kind)) : tags,
  );
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

  const [{ data, error }, hideMature] = await Promise.all([
    supabase
      .from("tags")
      .select(TAG_COLUMNS)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle(),
    hidesMatureTitles(),
  ]);

  if (error) throw new Error(`Failed to load tag: ${error.message}`);

  const tag = (data as Tag) ?? null;

  // An explicit tag reached by URL is a 404 rather than an empty page while
  // hiding is on. Hiding the pill in the index is presentation; this is the
  // check, because /discover/tag/ecchi is one typed URL away and the page
  // would otherwise render its heading and count for an account that may not
  // see any of it.
  if (tag && hideMature && isExplicitKind(tag.kind)) return null;

  return tag;
}

/**
 * How many catalog titles carry each tag, keyed by tag id.
 *
 * This is what /discover's category index needs, and the only thing it needs:
 * a tag nothing carries would be a pill leading to an empty page, and an empty
 * page reached from a deliberate press reads as a broken link rather than as
 * an honest "nothing here yet".
 *
 * Counted rather than joined to the titles themselves — the pills show a name
 * and a glyph, never a cover — so this reads one narrow column and never
 * touches `media_titles`.
 *
 * Paged for the same reason the library is: this is the whole curated link
 * table, and a row lost to `max_rows` would silently retire a tag from the
 * index while its page still works.
 *
 * Returns an empty map rather than throwing when the read fails. The index is
 * a way into the collections, not the collections themselves; losing it leaves
 * /discover as the shelf page it was before categories existed, which is a far
 * better answer than an error boundary over the whole route.
 */
export async function getTaggedTitleCounts(): Promise<Map<number, number>> {
  const supabase = await createClient();
  const hideMature = await hidesMatureTitles();

  let rows;
  try {
    rows = await readAllRows(
      (from, to) =>
        supabase
          .from("title_tags")
          // The catalog row comes along for its rating, so a category whose
          // only titles are adult drops out of the index for a user who asked
          // not to see them — otherwise its pill would still be offered and
          // its page would open empty, which is the dead link this count
          // exists to prevent. `!inner` also drops a link whose catalog row
          // went missing, the same shape every other read here takes.
          .select("id, tag_id, media_titles!inner ( nsfw )", { count: "exact" })
          // Curated links only, matching every other tag read here: a private
          // user tag must not widen somebody else's index.
          .is("owner_id", null)
          // A unique tiebreak, so a page boundary cannot fall inside a run of
          // rows that share a tag.
          .order("id", { ascending: true })
          .range(from, to),
      "tagged titles",
    );
  } catch {
    return new Map();
  }

  const links = screenMature(
    rows as unknown as { tag_id: number; media_titles: { nsfw: string | null } }[],
    hideMature,
    (row) => row.media_titles,
  );

  const counts = new Map<number, number>();

  for (const row of links) {
    counts.set(row.tag_id, (counts.get(row.tag_id) ?? 0) + 1);
  }

  return counts;
}

/** Active tags on one title, for the entry page's chips. */
export async function getTagsForTitle(titleId: number): Promise<Tag[]> {
  const supabase = await createClient();

  const [{ data, error }, hideMature] = await Promise.all([
    supabase
      .from("title_tags")
      .select(`tags!inner ( ${TAG_COLUMNS} )`)
      .eq("title_id", titleId)
      .is("owner_id", null),
    hidesMatureTitles(),
  ]);

  // Chips are a garnish; losing them should not take the entry page down.
  if (error) return [];

  // The same gate the index and the tag pages take. Without it an entry
  // page would render an Ecchi chip linking to a page that now 404s — the
  // one remaining way a gated category could still be seen and clicked.
  return sortTags(
    ((data ?? []) as unknown as { tags: Tag }[])
      .map((row) => row.tags)
      .filter((tag) => tag.is_active)
      .filter((tag) => !(hideMature && isExplicitKind(tag.kind))),
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

  const [{ data, error }, hideMature] = await Promise.all([
    supabase
      .from("title_tags")
      .select(
        `media_titles!inner (
           id, mal_media_id, title, title_en, main_picture_url,
           mal_media_kind, num_chapters, mal_status, nsfw
         )`,
      )
      .eq("tag_id", tagId)
      .is("owner_id", null),
    hidesMatureTitles(),
  ]);

  if (error) throw new Error(`Failed to load titles: ${error.message}`);

  const titles = ((data ?? []) as unknown as { media_titles: CollectionTitle }[])
    .map((row) => row.media_titles)
    .sort((a, b) => a.title.localeCompare(b.title));

  // The page's own count is derived from what this returns, so screening here
  // keeps "12 titles" and the twelve cards under it the same number.
  return screenMature(titles, hideMature, (title) => title);
}
