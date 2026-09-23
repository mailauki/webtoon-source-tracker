import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

import { toMalPublicationStatus } from "./mapping";

/** The privileged client these writes run through. */
type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/**
 * Writing an AniList-only title into the shared catalog.
 *
 * Goes through the `media_titles_upsert_anilist` RPC rather than
 * `.upsert(..., { onConflict })`, and that is not a stylistic choice. The
 * uniqueness that keeps these rows from duplicating is a PARTIAL index
 * (`where mal_media_id is null and anilist_media_id is not null`), and
 * Postgres only accepts a partial index as an ON CONFLICT arbiter when the
 * statement restates its predicate. PostgREST's `on_conflict=` takes column
 * names and has nowhere to put a WHERE clause, so the write failed with
 * 42P10 — "no unique or exclusion constraint matching the ON CONFLICT
 * specification" — every time.
 *
 * Widening the index to a total unique would have satisfied PostgREST, and
 * was rejected: it would also forbid a MAL-backed row from caching an AniList
 * id that an AniList-only row already holds, which lib/anilist/mirror.ts does
 * routinely. See the migration for the full reasoning.
 *
 * Shared by the search-page add action and the list pull so there is one
 * definition of what an AniList-only catalog row looks like.
 */

/** The shape both callers already have, from a search hit or a list entry. */
export type AniListTitleFields = {
  anilistMediaId: number;
  title: string;
  titleEn: string | null;
  coverUrl: string | null;
  format: string | null;
  chapters: number | null;
  volumes: number | null;
  /** AniList's own status string; translated here, not by the caller. */
  status: string | null;
  isAdult: boolean | null;
};

/**
 * Omits a key rather than sending null.
 *
 * Every optional parameter on the RPC defaults to null in SQL, so an absent
 * key and an explicit null store the same thing — but PostgREST's generated
 * types spell the optional ones `string | undefined`, and threading nulls
 * through would mean casting at every call site.
 */
const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined;

/** Upserts one AniList-only title and returns its catalog row id. */
export async function upsertAniListTitle(
  admin: SupabaseAdmin,
  fields: AniListTitleFields,
): Promise<number> {
  const { data, error } = await admin.rpc("media_titles_upsert_anilist", {
    p_anilist_media_id: fields.anilistMediaId,
    p_title: fields.title,
    p_title_en: orUndefined(fields.titleEn),
    p_main_picture_url: orUndefined(fields.coverUrl),
    p_media_kind: orUndefined(fields.format?.toLowerCase() ?? null),
    p_num_chapters: orUndefined(fields.chapters),
    p_num_volumes: orUndefined(fields.volumes),
    // AniList's vocabulary translated into MAL's, which is what the column
    // stores and what chapterTotal() matches on.
    p_mal_status: orUndefined(toMalPublicationStatus(fields.status)),
    // AniList states this as a boolean; mapped onto the rating strings
    // lib/data/nsfw.ts reads, so these rows obey the hide-adult switch.
    p_nsfw: fields.isAdult ? "black" : "white",
  });

  if (error) {
    throw new Error(`Catalog upsert failed: ${error.message}`);
  }
  if (typeof data !== "number") {
    throw new Error("Catalog upsert returned no row id");
  }

  return data;
}
