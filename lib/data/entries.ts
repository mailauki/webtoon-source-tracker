import "server-only";

import { readAllRows } from "@/lib/data/pagination";
import { MAL_LIST_STATUSES } from "@/lib/mal/types";
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
 *
 * Read through readAllRows because the whole shelf really does mean the whole
 * shelf: PostgREST would otherwise cut it off at `max_rows` without saying so,
 * and everything downstream — the chips, the dice, the search page — narrows
 * what it is handed and would report a title as absent rather than as hidden.
 * A library inside the cap still costs one query; see lib/data/pagination.ts.
 */
export async function getLibrary() {
  const supabase = await createClient();

  return readAllRows(
    (from, to) =>
      supabase
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
          // The exact total, which the row cap does not truncate — it is what
          // tells the loop whether a second page exists.
          { count: "exact" },
        )
        .order("mal_updated_at", { ascending: false, nullsFirst: false })
        // Ties on `mal_updated_at` are common (a bulk edit stamps a whole
        // batch), and paging an unstable order drops and repeats rows across
        // the boundary. `id` is the unique tiebreak that pins it.
        .order("id", { ascending: true })
        .range(from, to),
    "library",
  );
}

export type LibraryRow = Awaited<ReturnType<typeof getLibrary>>[number];

/**
 * Counts per status, for the filter chips.
 *
 * One `head: true` count per status rather than tallying the rows in JS. The
 * old shape selected every entry just to produce five integers, which was both
 * a whole table over the wire and — since that select was subject to
 * `max_rows` — a set of counts that silently stopped growing at a thousand.
 * PostgREST's exact count is not capped, so these stay true at any size.
 *
 * A failed count reads as 0, which drops that chip (the page only offers chips
 * with a count above zero). Losing one chip is the right degradation here: the
 * grid it filters is already on screen.
 */
export async function getStatusCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();

  const counts = await Promise.all(
    MAL_LIST_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from("user_entries")
        .select("id", { count: "exact", head: true })
        .eq("list_status", status);

      return [status, error ? 0 : (count ?? 0)] as const;
    }),
  );

  return Object.fromEntries(counts);
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
