import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Library reads.
 *
 * These use the request-scoped (RLS-enforced) client, not the admin client:
 * the user should only ever see their own entries, and RLS is the guarantee.
 */

/**
 * One query for the whole library view: the user's entries, each with its
 * catalog title and its source assignments.
 *
 * `media_titles!inner` makes the title join an inner join: an entry whose
 * catalog row is missing is not a shelf item, and an outer join would hand the
 * grid a card with no title on it.
 *
 * Nothing is filtered here — not status, not source, not the search term.
 * Every field those narrow on already rides along on these rows, so the chips
 * apply in the browser (see components/library-grid.tsx) and the search page
 * matches titles the same way (see lib/data/search.ts); re-querying for either
 * would be a round-trip for data we already sent. Sorting works the same way:
 * the `order` below is only the order rows arrive in, and the client re-sorts
 * to the stored preference.
 */
export async function getLibrary() {
  const supabase = await createClient();

  const query = supabase
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
      created_at,
      media_titles!inner (
        id, mal_media_id, title, title_en, main_picture_url,
        mal_media_kind, num_chapters, num_volumes, mal_status
      ),
      entry_sources (
        id, url, chapters_read, chapters_owned,
        is_primary, is_official, is_paid, is_hiatus, is_owned, notes,
        sources ( id, slug, name, logo_url, owner_id )
      )
    `,
    )
    .order("mal_updated_at", { ascending: false, nullsFirst: false });

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
        id, url, chapters_read, chapters_owned,
        is_primary, is_official, is_paid, is_hiatus, is_owned, notes,
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
