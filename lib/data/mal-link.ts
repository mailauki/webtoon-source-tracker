import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { kindsCompatible, nameKeys } from "@/lib/data/cross-search";
import { displayTitle } from "@/lib/data/display-title";
import { duplicateKey, findDuplicates, type DuplicateRow } from "@/lib/data/duplicates";
import { malAltTitles } from "@/lib/mal/alt-titles";
import { searchManga } from "@/lib/mal/endpoints";
import type { Database } from "@/lib/supabase/types";

export type Title = DuplicateRow["media_titles"] & { anilist_media_id: number };

/**
 * The MyAnimeList title an AniList-only title looks like, by the same strict
 * name rule as findDuplicates, from a live MAL search. Null when MAL has no
 * single match or cannot be reached.
 */
async function findOnMal(title: Title) {
  try {
    const page = await searchManga(null, title.title.slice(0, 64), 10, {
      includeMature: true,
    });
    const keys = nameKeys({ ...title, alt_titles: title.alt_titles ?? [] });
    const matches = page.data
      .map(({ node }) => node)
      .filter(
        (node) =>
          kindsCompatible(node.media_type ?? null, title.mal_media_kind) &&
          [
            ...nameKeys({
              title: node.title,
              title_en: node.alternative_titles?.en || null,
              alt_titles: malAltTitles(node),
            }),
          ].some((key) => keys.has(key)),
      );
    return matches.length === 1 ? matches[0] : null;
  } catch (cause) {
    console.error("[entry-mal-link] MAL search failed:", cause);
    return null;
  }
}

/**
 * What the entry page says about an AniList-only title: the MyAnimeList
 * title it looks like, and that title's entry in this user's library when
 * it passes the same check the merge makes — so Merge is never offered only
 * to be refused. Read through the given client, for the web or the app.
 */
export async function findMalLink(
  supabase: SupabaseClient<Database>,
  entryId: number,
  title: Title,
) {
  const found = await findOnMal(title);

  // The library copy, if any, and only when it passes the same check the
  // merge action makes — so the button is never offered to be refused.
  let twin: { id: number; titleId: number; title: string } | null = null;
  if (found) {
    const { data } = await supabase
      .from("user_entries")
      .select(
        "id, media_titles!inner (id, mal_media_id, anilist_media_id, title, title_en, alt_titles, mal_media_kind)",
      )
      .is("archived_at", null)
      .eq("media_titles.mal_media_id", found.id);
    const [pair] = findDuplicates(
      [{ id: entryId, media_titles: title }, ...(data ?? [])],
      await dismissedFor(supabase),
    );
    if (pair?.anilist.id === entryId) {
      twin = {
        id: pair.mal.id,
        titleId: pair.mal.media_titles.id,
        title: displayTitle(pair.mal.media_titles),
      };
    }
  }

  return { found, twin };
}

async function dismissedFor(supabase: SupabaseClient<Database>): Promise<Set<string>> {
  const { data } = await supabase
    .from("dismissed_duplicates")
    .select("anilist_title_id, mal_title_id");
  return new Set((data ?? []).map((row) => duplicateKey(row.anilist_title_id, row.mal_title_id)));
}
