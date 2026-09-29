import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * How many name matches one search may save. A page of results rarely holds
 * more than a few, and this keeps a pathological query from turning one
 * search into dozens of writes.
 */
const MAX_LINKS = 10;

/**
 * Saves the AniList id a search matched to a MAL title by name, onto that
 * title's catalog row.
 *
 * Only fills a gap, never overwrites: the update is conditioned on
 * `anilist_media_id is null`, so an id the mirror resolved through AniList's
 * own `idMal` — which is AniList's statement rather than the app's inference —
 * always wins over a name match. Only rows that already exist are touched; a
 * title nobody tracks has no catalog row, and this does not create one.
 *
 * Written with the admin client because `media_titles` is a shared catalog
 * owned by nobody, as addEntry's upsert is. Safe against the uniqueness rules:
 * only AniList-only rows are unique on `anilist_media_id` (see the
 * anilist_only_titles migration), and every row this writes has a MAL id.
 *
 * Best-effort. It runs after the search has answered (see the route's
 * `after`), and a failure costs only the head start, so it is logged rather
 * than thrown.
 */
export async function rememberNameMatches(
  links: { malMediaId: number; anilistMediaId: number }[],
): Promise<void> {
  if (links.length === 0) return;

  const admin = createAdminClient();
  const results = await Promise.all(
    links.slice(0, MAX_LINKS).map(({ malMediaId, anilistMediaId }) =>
      admin
        .from("media_titles")
        .update({ anilist_media_id: anilistMediaId })
        .eq("media_type", "manga")
        .eq("mal_media_id", malMediaId)
        .is("anilist_media_id", null),
    ),
  );

  for (const { error } of results) {
    if (error) console.error("[catalog-links] save failed:", error.message);
  }
}
