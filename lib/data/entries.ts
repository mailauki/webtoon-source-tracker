import "server-only";

import { hidesMatureTitles } from "@/lib/auth/dal";
import type { LibraryMatch } from "@/lib/data/author-works";
import { displayTitle } from "@/lib/data/display-title";
import { duplicateKey } from "@/lib/data/duplicates";
import { entryCover } from "@/lib/data/entry-cover";
import { screenMature } from "@/lib/data/nsfw";
import { readAllRows } from "@/lib/data/pagination";
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
 *
 * The one thing that IS filtered here is the adult-content switch, and it is
 * filtered here precisely because everything downstream reads these rows: the
 * chips, the dice, the search page's library half and the status counts would
 * each need their own copy of the rule otherwise. Filtered in JS rather than
 * in the query because `nsfw` is null for every row the backfill has not
 * reached, and PostgREST's `not.in` drops nulls along with the matches — which
 * would hide most of a shelf rather than the adult part of it.
 */
export async function getLibrary() {
  const supabase = await createClient();
  const hideMature = await hidesMatureTitles();

  const rows = await readAllRows(
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
      sync_to_mal,
      sync_to_anilist,
      cover_url,
      media_titles!inner (
        id, mal_media_id, anilist_media_id, title, title_en, alt_titles,
        main_picture_url, mal_media_kind, num_chapters, num_volumes, mal_status,
        nsfw
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
        // A removed title is gone from the user's point of view; the row
        // survives only so the removal can be undone.
        .is("archived_at", null)
        .order("mal_updated_at", { ascending: false, nullsFirst: false })
        // Ties on `mal_updated_at` are common (a bulk edit stamps a whole
        // batch), and paging an unstable order drops and repeats rows across
        // the boundary. `id` is the unique tiebreak that pins it.
        .order("id", { ascending: true })
        .range(from, to),
    "library",
  );

  return screenMature(rows, hideMature, (row) => row.media_titles);
}

export type LibraryRow = Awaited<ReturnType<typeof getLibrary>>[number];

/**
 * The reader's own entries for any of these titles, by AniList or MAL id —
 * what the entry page's "more from this author" links to.
 *
 * Archived entries are left out: a removed title is gone from the reader's
 * point of view, and linking to it would send them to a restore page rather
 * than to a title they track. A failed read is an empty shelf, not an error —
 * every work still links out to AniList without it.
 */
export async function getLibraryMatches(ids: {
  anilistIds: number[];
  malIds: number[];
}): Promise<LibraryMatch[]> {
  const filters = [
    ids.anilistIds.length > 0
      ? `anilist_media_id.in.(${ids.anilistIds.join(",")})`
      : null,
    ids.malIds.length > 0 ? `mal_media_id.in.(${ids.malIds.join(",")})` : null,
  ].filter((filter): filter is string => filter !== null);
  if (filters.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_entries")
    .select(
      "id, cover_url, media_titles!inner(anilist_media_id, mal_media_id, title, title_en, main_picture_url)",
    )
    .is("archived_at", null)
    .or(filters.join(","), { referencedTable: "media_titles" });

  if (error) {
    console.error("[entries/library-matches] failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    entryId: row.id,
    anilistMediaId: row.media_titles.anilist_media_id,
    malMediaId: row.media_titles.mal_media_id,
    title: displayTitle(row.media_titles),
    cover: entryCover(row),
  }));
}

/**
 * A single entry with its title and sources.
 *
 * Returns null when the entry does not exist OR belongs to someone else — RLS
 * makes those indistinguishable, which is the desired behaviour: a wrong id
 * and someone else's id both 404 rather than confirming existence.
 *
 * Deliberately NOT narrowed by the adult-content switch, unlike getLibrary
 * above. That switch decides what turns up while browsing; this is a title the
 * user tracks, reached by its own id, usually from a bookmark or the back
 * button. Hiding it here would 404 something they own — which is the "the app
 * lost my data" reading the whole setting is shaped to avoid.
 *
 * Deliberately NOT filtered on `archived_at`: this is the page a removed title
 * is restored from, so hiding it here would strand the row with no way back.
 * Every surface that lists a *library* filters archived rows out; this one
 * reads a single entry the user asked for by id.
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
      archived_at,
      sync_to_mal,
      sync_to_anilist,
      cover_url,
      media_titles!inner (
        id, mal_media_id, anilist_media_id, title, title_en, alt_titles,
        main_picture_url, mal_media_kind, num_chapters, num_volumes, mal_status
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


/**
 * The possible duplicates this user has said are not duplicates, as
 * duplicateKey()s for findDuplicates. Empty on failure: a dismissed pair
 * showing again is a nuisance, not a reason to fail the page.
 */
export async function getDismissedDuplicates(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dismissed_duplicates")
    .select("anilist_title_id, mal_title_id");

  if (error) {
    console.error("[entries/dismissed-duplicates] failed:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? []).map((row) => duplicateKey(row.anilist_title_id, row.mal_title_id)),
  );
}
