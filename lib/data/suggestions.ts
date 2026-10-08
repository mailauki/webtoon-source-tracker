import "server-only";

import { verifySession } from "@/lib/auth/dal";
import type { CollectionTitle } from "@/lib/data/collection-items";
import type { Tag } from "@/lib/data/tag-items";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for reader suggestions. Writes live in app/actions/suggestions.ts.
 *
 * RLS lets a reader see their own suggestions and an admin see everyone's,
 * so the reader-facing reads filter on user_id explicitly — otherwise an
 * admin would see other readers' pending chips as their own.
 */

const TITLE_COLUMNS = `id, mal_media_id, title, title_en, main_picture_url,
  mal_media_kind, num_chapters, mal_status`;

/** The tags the viewer has suggested for one title and are still pending. */
export async function getMyTagSuggestions(titleId: number): Promise<Tag[]> {
  const { userId } = await verifySession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tag_suggestions")
    .select(
      "tags (id, slug, name, description, kind, mal_genre_id, sort_order, is_active)",
    )
    .eq("title_id", titleId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to load suggestions: ${error.message}`);

  return (data ?? []).flatMap((row) => (row.tags ? [row.tags as Tag] : []));
}

/** Whether one of the viewer's collections is waiting on an admin. */
export async function isCollectionSuggested(collectionId: number): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collection_suggestions")
    .select("id")
    .eq("collection_id", collectionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load suggestion: ${error.message}`);
  return data !== null;
}

export type PendingTagSuggestion = {
  id: number;
  tag: { id: number; name: string };
  title: CollectionTitle;
};

export type PendingCollectionSuggestion = {
  id: number;
  name: string;
  description: string | null;
  titles: CollectionTitle[];
};

/**
 * Every pending suggestion, oldest first, for /admin/suggestions.
 *
 * Several readers suggesting the same tag on the same title come back as
 * separate rows; approving one answers them all (see reviewTagSuggestion).
 */
export async function getPendingSuggestions(): Promise<{
  tags: PendingTagSuggestion[];
  collections: PendingCollectionSuggestion[];
}> {
  const supabase = await createClient();

  const [tags, collections] = await Promise.all([
    supabase
      .from("tag_suggestions")
      .select(`id, tags!inner (id, name), media_titles!inner (${TITLE_COLUMNS})`)
      .order("created_at"),
    supabase
      .from("collection_suggestions")
      .select(
        `id, collections!inner (name, description,
           collection_items (position, media_titles!inner (${TITLE_COLUMNS})))`,
      )
      .order("created_at"),
  ]);

  if (tags.error) throw new Error(`Failed to load suggestions: ${tags.error.message}`);
  if (collections.error) {
    throw new Error(`Failed to load suggestions: ${collections.error.message}`);
  }

  return {
    tags: (tags.data ?? []).map((row) => ({
      id: row.id,
      tag: row.tags,
      title: row.media_titles as unknown as CollectionTitle,
    })),
    collections: (collections.data ?? []).map((row) => ({
      id: row.id,
      name: row.collections.name,
      description: row.collections.description,
      titles: [...row.collections.collection_items]
        .sort((a, b) => a.position - b.position)
        .map((item) => item.media_titles as unknown as CollectionTitle),
    })),
  };
}

/** How many suggestions are pending, for the admin index. */
export async function countPendingSuggestions(): Promise<number> {
  const supabase = await createClient();

  const [tags, collections] = await Promise.all([
    supabase.from("tag_suggestions").select("id", { count: "exact", head: true }),
    supabase
      .from("collection_suggestions")
      .select("id", { count: "exact", head: true }),
  ]);

  if (tags.error) throw new Error(`Failed to count suggestions: ${tags.error.message}`);
  if (collections.error) {
    throw new Error(`Failed to count suggestions: ${collections.error.message}`);
  }

  return (tags.count ?? 0) + (collections.count ?? 0);
}
