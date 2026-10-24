import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { linkAniListIds } from "@/lib/anilist/catalog";
import { duplicateKey, findDuplicates } from "@/lib/data/duplicates";
import { readAllRows } from "@/lib/data/pagination";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

const TITLE_COLUMNS =
  "id, mal_media_id, anilist_media_id, title, title_en, alt_titles, mal_media_kind, main_picture_url, nsfw";

/**
 * The possible duplicates in one user's library, read through their own
 * client — for the iOS app, which has no cookie session for getLibrary.
 * The same rule as Settings (findDuplicates), less dismissed pairs. Adult
 * titles are not screened here: the app knows the user's setting and does.
 */
export async function getDuplicatePairs(supabase: SupabaseClient<Database>) {
  const [rows, { data: dismissed }] = await Promise.all([
    readAllRows(
      (from, to) =>
        supabase
          .from("user_entries")
          .select(`id, cover_url, media_titles!inner (${TITLE_COLUMNS})`, { count: "exact" })
          .is("archived_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      "library",
    ),
    supabase.from("dismissed_duplicates").select("anilist_title_id, mal_title_id"),
  ]);

  return findDuplicates(
    rows,
    new Set((dismissed ?? []).map((row) => duplicateKey(row.anilist_title_id, row.mal_title_id))),
  );
}

export type MergeDuplicateResult =
  | { ok: true; entryId: number }
  | { ok: false; error: string };

/**
 * Merges an AniList-only title into the MyAnimeList title it duplicates.
 *
 * The merge itself is the catalog merge the syncs run (link_anilist_ids): it
 * records the AniList id on the MAL row and folds the AniList-only row into
 * it, for every user who holds it. That reaches past this user's library, so
 * the pair is never taken on trust: both entries are read back through the
 * user's own client, and they must still pass findDuplicates — the same rule
 * the catalog search already uses to link the two sites. A request naming
 * any other two titles is refused.
 */
export async function mergeDuplicatePair(
  supabase: SupabaseClient<Database>,
  ids: { anilistEntryId: number; malEntryId: number },
): Promise<MergeDuplicateResult> {
  const { data: rows, error } = await supabase
    .from("user_entries")
    .select(
      "id, media_titles!inner (id, mal_media_id, anilist_media_id, title, title_en, alt_titles, mal_media_kind)",
    )
    .in("id", [ids.anilistEntryId, ids.malEntryId])
    .is("archived_at", null);

  if (error) return { ok: false, error: "Those titles couldn't be read." };

  const [pair] = findDuplicates(rows ?? []);
  if (!pair || pair.anilist.id !== ids.anilistEntryId || pair.mal.id !== ids.malEntryId) {
    return { ok: false, error: "Those titles don't look like the same series." };
  }

  try {
    const merged = await linkAniListIds(createAdminClient(), [
      {
        malMediaId: pair.mal.media_titles.mal_media_id!,
        anilistMediaId: pair.anilist.media_titles.anilist_media_id!,
      },
    ]);
    if (merged === 0) return { ok: false, error: "Nothing was merged. Refresh and try again." };
  } catch (cause) {
    console.error("[merge-duplicate] failed:", cause);
    return { ok: false, error: "The merge failed. Please try again." };
  }

  return { ok: true, entryId: pair.mal.id };
}
