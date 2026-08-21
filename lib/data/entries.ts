import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Library reads.
 *
 * These use the request-scoped (RLS-enforced) client, not the admin client:
 * the user should only ever see their own entries, and RLS is the guarantee.
 */

export type LibraryFilters = {
  q?: string;
};

/**
 * One query for the whole library view: the user's entries, each with its
 * catalog title and its source assignments.
 *
 * `media_titles!inner` makes the title join an inner join so a filter on the
 * title (search) narrows the entries rather than returning nulls.
 *
 * Status and source are deliberately not filtered here. They are stored per
 * user and applied in the browser (see components/library-grid.tsx), because
 * every field they filter on already rides along on these rows — re-querying
 * for a chip click would be a round-trip for data we already sent.
 */
export async function getLibrary(filters: LibraryFilters = {}) {
  const supabase = await createClient();

  let query = supabase
    .from("user_entries")
    .select(
      `
      id,
      list_status,
      num_chapters_read,
      num_volumes_read,
      score,
      is_rereading,
      mal_updated_at,
      media_titles!inner (
        id, mal_media_id, title, title_en, main_picture_url,
        mal_media_kind, num_chapters, num_volumes, mal_status
      ),
      entry_sources (
        id, url, chapters_read, is_primary, is_official, is_paid, notes,
        sources ( id, slug, name, logo_url, owner_id )
      )
    `,
    )
    .order("mal_updated_at", { ascending: false, nullsFirst: false });

  if (filters.q) {
    // Escape PostgREST's pattern characters so a search for "%" is literal.
    const term = filters.q.replace(/[%_]/g, "\\$&");
    query = query.ilike("media_titles.title", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load library: ${error.message}`);

  return data ?? [];
}

export type LibraryRow = Awaited<ReturnType<typeof getLibrary>>[number];

/** Counts per status, for the filter chips. */
export async function getStatusCounts() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_entries")
    .select("list_status");

  if (error) return {} as Record<string, number>;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.list_status] = (counts[row.list_status] ?? 0) + 1;
  }
  return counts;
}

/**
 * A single entry with its title and sources.
 *
 * Returns null when the entry does not exist OR belongs to someone else — RLS
 * makes those indistinguishable, which is the desired behaviour: a wrong id
 * and someone else's id both 404 rather than confirming existence.
 */
export async function getEntry(entryId: number) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_entries")
    .select(
      `
      id,
      list_status,
      num_chapters_read,
      num_volumes_read,
      score,
      is_rereading,
      mal_updated_at,
      synced_at,
      media_titles!inner (
        id, mal_media_id, title, title_en, main_picture_url,
        mal_media_kind, num_chapters, num_volumes, mal_status
      ),
      entry_sources (
        id, url, chapters_read, is_primary, is_official, is_paid, notes,
        sources ( id, slug, name, logo_url, base_url, owner_id )
      )
    `,
    )
    .eq("id", entryId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load entry: ${error.message}`);
  return data;
}

export type EntryDetail = NonNullable<Awaited<ReturnType<typeof getEntry>>>;
