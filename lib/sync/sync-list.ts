import "server-only";

import { slugify } from "@/lib/data/tag-items";
import { MalClient } from "@/lib/mal/client";
import { getMangaList } from "@/lib/mal/endpoints";
import type { MalListEntry } from "@/lib/mal/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStale } from "./staleness";

/**
 * Pulls a user's MyAnimeList manga list into Supabase.
 *
 * Writes land in two tables:
 *   media_titles — the shared catalog (upserted, owned by nobody)
 *   user_entries — this user's progress against those titles
 *
 * `entry_sources` is app-owned and NEVER touched here: those assignments are
 * hand-entered and irreplaceable, so sync must not be able to destroy them.
 */

const PAGE_SIZE = 100; // MAL's maximum
const MAX_PAGES = 50; // hard bound: 5,000 titles
const BATCH_SIZE = 500;

export type SyncResult = {
  skipped: boolean;
  titles: number;
  entries: number;
  removed: number;
  pages: number;
  durationMs: number;
};

/** Splits an array into fixed-size chunks for batched round trips. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Writes MAL's genres into the tag vocabulary.
 *
 * MAL seeds; the database owns. Tags are inserted with ignoreDuplicates on
 * mal_genre_id — `on conflict do nothing`, never `do update` — so MAL can
 * bring a tag into existence and can never modify one that already exists.
 * That is what lets an admin rename "Girls Love" and have the new name survive
 * every later sync, and why there is no display_name column and no read-only
 * class of tag: the conflict those would resolve cannot occur.
 *
 * The title_tags links ARE re-evaluated every sync, so a title newly given a
 * genre by MAL picks it up. Only the tag entity is frozen after creation.
 * Re-evaluated, not blindly re-inserted: a link already on file for a title
 * is left alone rather than duplicated (see the dedupe below and migration
 * 20260909000002 for why a naive upsert doesn't do this on its own).
 *
 * Runs as the service role, which bypasses RLS — this needs no admin and no
 * policy of its own.
 */
export async function syncGenres(
  admin: ReturnType<typeof createAdminClient>,
  nodes: { id: number; genres?: { id: number; name: string }[] }[],
  idMap: Map<number, number>,
): Promise<void> {
  // Deduplicate by MAL genre id: the same genre appears on most titles.
  const genres = new Map<number, string>();
  for (const node of nodes) {
    for (const genre of node.genres ?? []) genres.set(genre.id, genre.name);
  }

  if (genres.size === 0) return;

  // This contract has a second, deliberately duplicated copy in
  // scripts/backfill-genres.ts's syncGenresBatch (that file can't import this
  // module — see its header comment), pinned there by
  // tests/backfill-genres.test.ts. If you touch this line, check that one
  // too. grep mal_genre_id to find it.
  const { error: tagError } = await admin.from("tags").upsert(
    [...genres].map(([id, name]) => ({
      mal_genre_id: id,
      slug: slugify(name),
      name,
      kind: "genre" as const,
    })),
    { onConflict: "mal_genre_id", ignoreDuplicates: true },
  );

  if (tagError) throw new Error(`Genre upsert failed: ${tagError.message}`);

  // Read back to map MAL genre ids to tag ids. Necessary because
  // ignoreDuplicates means the upsert returns nothing for rows it skipped.
  const { data: tagRows, error: readError } = await admin
    .from("tags")
    .select("id, mal_genre_id")
    .in("mal_genre_id", [...genres.keys()]);

  if (readError) throw new Error(`Genre lookup failed: ${readError.message}`);

  const tagIds = new Map(
    (tagRows ?? [])
      .filter((row) => row.mal_genre_id !== null)
      .map((row) => [row.mal_genre_id as number, row.id]),
  );

  const links = [];
  for (const node of nodes) {
    const titleId = idMap.get(node.id);
    // No catalog row means the title upsert skipped it; a null title_id would
    // violate the not-null constraint rather than degrade.
    if (!titleId) continue;

    for (const genre of node.genres ?? []) {
      const tagId = tagIds.get(genre.id);
      if (!tagId) continue;
      links.push({ title_id: titleId, tag_id: tagId, owner_id: null });
    }
  }

  if (links.length === 0) return;

  // Dedupe against the curated rows that already exist, then insert only the
  // missing links.
  //
  // This is NOT `.upsert({ onConflict: "title_id,tag_id" })`. PostgREST's
  // on_conflict param only ever becomes `ON CONFLICT (columns)` — a bare
  // column list with no predicate — so it can only target a full unique
  // constraint on exactly those columns. It cannot express `WHERE owner_id
  // is null`, so it cannot address title_tags_curated_uniq (see migration
  // 20260909000002), and title_tags_uniq needs all three columns including
  // owner_id, which every curated row leaves null and non-colliding (see the
  // same migration for why that constraint alone doesn't dedupe curated
  // rows). Confirmed against the actual client: @supabase/postgrest-js's
  // upsert() does `url.searchParams.set('on_conflict', onConflict)` and nothing
  // else — there is no options field for an index predicate. PostgREST itself
  // has no way to accept one either (tracked upstream as
  // PostgREST/postgrest#2123, still open). So there is no onConflict spelling
  // that reaches the partial index; read-then-insert is what's left.
  //
  // The read is scoped to just the titles in this sync, not the whole table,
  // and title_id is indexed (title_tags_title_idx), so this stays cheap even
  // as the catalog grows.
  const linkedTitleIds = [...new Set(links.map((link) => link.title_id))];
  const existingLinks = new Set<string>();

  for (const batch of chunk(linkedTitleIds, BATCH_SIZE)) {
    const { data, error } = await admin
      .from("title_tags")
      .select("title_id, tag_id")
      .is("owner_id", null)
      .in("title_id", batch);

    if (error) throw new Error(`Genre link lookup failed: ${error.message}`);
    for (const row of data ?? []) existingLinks.add(`${row.title_id}:${row.tag_id}`);
  }

  const newLinks = links.filter(
    (link) => !existingLinks.has(`${link.title_id}:${link.tag_id}`),
  );

  if (newLinks.length === 0) return;

  // Write per title, not in one big batch. A single batched insert spanning
  // many unrelated titles means one lost race — another sync inserting the
  // same (title_id, tag_id) between our read and our write — aborts the
  // WHOLE statement: Postgres rolls back every row in a failed INSERT, so
  // one collision on title 2's genre would silently drop titles 1, 3 and 4's
  // links too, even though nothing was wrong with them. Verified against
  // Postgres 17.11: a 4-row insert with one row already present raises
  // duplicate key value violates unique constraint "title_tags_curated_uniq"
  // and inserts zero of the four rows.
  //
  // Grouping by title_id narrows the blast radius to "the racing title's
  // links may be incomplete this run" instead of "an arbitrary unrelated
  // title's links vanished." A title has a handful of genres, so this grain
  // is small and natural, not an arbitrary chunk boundary.
  //
  // A 23505 (unique_violation) on a title's insert means someone else's sync
  // already wrote the row we wanted — the desired end state (this title
  // linked to this genre) already holds, so that is success, not failure.
  // Only 23505 is swallowed: any other code (a dropped connection, an RLS/
  // policy change, a constraint we don't expect) still throws, exactly as
  // before — silently ignoring every error is what let the original bug hide
  // in the first place.
  const linksByTitle = new Map<number, typeof newLinks>();
  for (const link of newLinks) {
    const existing = linksByTitle.get(link.title_id);
    if (existing) existing.push(link);
    else linksByTitle.set(link.title_id, [link]);
  }

  for (const rows of linksByTitle.values()) {
    const { error } = await admin.from("title_tags").insert(rows);
    if (error && error.code !== "23505") {
      throw new Error(`Genre link failed: ${error.message}`);
    }
  }
}

export async function syncMalList(
  userId: string,
  options: { force?: boolean } = {},
): Promise<SyncResult> {
  const startedAt = Date.now();
  const admin = createAdminClient();

  const empty = (skipped: boolean): SyncResult => ({
    skipped,
    titles: 0,
    entries: 0,
    removed: 0,
    pages: 0,
    durationMs: Date.now() - startedAt,
  });

  const { data: connection } = await admin
    .from("mal_connections")
    .select("status, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection || connection.status !== "active") {
    return empty(true);
  }

  if (!options.force && !isStale(connection.last_synced_at)) {
    return empty(true);
  }

  // --- 1. Page through the list -------------------------------------------
  const client = new MalClient(userId);
  const collected: MalListEntry[] = [];
  let pages = 0;
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await getMangaList(client, {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });

    collected.push(...result.data);
    pages++;

    if (!result.paging.next) {
      complete = true;
      break;
    }
  }

  if (collected.length === 0) {
    // An empty list is legitimate, but so is a MAL hiccup. Do not run the
    // removal step here — see the guard below for why that matters.
    await admin
      .from("mal_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { ...empty(false), pages };
  }

  // --- 2. Upsert the shared catalog ---------------------------------------
  // Deduplicate first: MAL can return the same title twice across pages if the
  // list is edited mid-sync, and a batch upsert with duplicate conflict keys
  // fails ("cannot affect row a second time").
  const titleRows = new Map<number, {
    media_type: "manga";
    mal_media_id: number;
    title: string;
    title_en: string | null;
    main_picture_url: string | null;
    mal_media_kind: string | null;
    num_chapters: number | null;
    num_volumes: number | null;
    mal_status: string | null;
    synced_at: string;
  }>();

  const now = new Date().toISOString();

  for (const { node } of collected) {
    titleRows.set(node.id, {
      media_type: "manga",
      mal_media_id: node.id,
      title: node.title,
      title_en: node.alternative_titles?.en || null,
      main_picture_url: node.main_picture?.large ?? node.main_picture?.medium ?? null,
      mal_media_kind: node.media_type ?? null,
      num_chapters: node.num_chapters ?? null,
      num_volumes: node.num_volumes ?? null,
      mal_status: node.status ?? null,
      synced_at: now,
    });
  }

  for (const batch of chunk([...titleRows.values()], BATCH_SIZE)) {
    const { error } = await admin
      .from("media_titles")
      .upsert(batch, { onConflict: "media_type,mal_media_id" });
    if (error) throw new Error(`Catalog upsert failed: ${error.message}`);
  }

  // Map MAL ids -> catalog ids so user_entries can reference them.
  const malIds = [...titleRows.keys()];
  const idMap = new Map<number, number>();

  for (const batch of chunk(malIds, BATCH_SIZE)) {
    const { data, error } = await admin
      .from("media_titles")
      .select("id, mal_media_id")
      .eq("media_type", "manga")
      .in("mal_media_id", batch);

    if (error) throw new Error(`Catalog lookup failed: ${error.message}`);
    for (const row of data ?? []) idMap.set(row.mal_media_id, row.id);
  }

  // Genres are catalog-level facts, so they are written with the catalog
  // rather than per user. A failure here must not fail the sync: the user's
  // progress is the point of this function, and a missing genre tag is
  // cosmetic.
  try {
    await syncGenres(admin, collected.map((c) => c.node), idMap);
  } catch (error) {
    console.error("Genre sync failed:", error);
  }

  // --- 3. Upsert this user's entries --------------------------------------
  const entryRows = [];

  for (const entry of collected) {
    const titleId = idMap.get(entry.node.id);
    // list_status is optional in MAL's schema; without it there is no progress
    // to record, so skip rather than invent defaults.
    if (!titleId || !entry.list_status) continue;

    entryRows.push({
      user_id: userId,
      title_id: titleId,
      list_status: entry.list_status.status,
      num_chapters_read: entry.list_status.num_chapters_read,
      num_volumes_read: entry.list_status.num_volumes_read,
      score: entry.list_status.score,
      is_rereading: entry.list_status.is_rereading,
      mal_updated_at: entry.list_status.updated_at ?? null,
      synced_at: now,
    });
  }

  for (const batch of chunk(entryRows, BATCH_SIZE)) {
    const { error } = await admin
      .from("user_entries")
      .upsert(batch, { onConflict: "user_id,title_id" });
    if (error) throw new Error(`Entry upsert failed: ${error.message}`);
  }

  // --- 4. Removals, heavily guarded ---------------------------------------
  //
  // Deleting entries that are no longer on MAL cascades to entry_sources,
  // destroying hand-entered source assignments. If MAL returned a partial list
  // (a failed page, a transient error), an unguarded delete would wipe data
  // that cannot be recovered. So removals only run when BOTH hold:
  //   a) every page was fetched without error, and
  //   b) the fetched count is more than half of what we already have.
  let removed = 0;

  const { count: existingCount } = await admin
    .from("user_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  // TODO(soft-delete): this is a hard delete, and it cascades to entry_sources
  // — the hand-entered data no sync can rebuild. The 50% guard below makes a
  // truncated MAL response non-destructive, but a genuine MAL-side deletion is
  // still irreversible here. Consider an `archived_at` column so removals are
  // recoverable. Highest-consequence code in the app; see TODO.md.
  const looksComplete =
    complete && (existingCount ?? 0) > 0 &&
    entryRows.length > (existingCount ?? 0) * 0.5;

  if (looksComplete && entryRows.length > 0) {
    const keepTitleIds = entryRows.map((r) => r.title_id);
    // Guarded above: an empty list would render `not in ()`, which is invalid
    // SQL and would otherwise delete the user's whole library.

    const { data: deleted, error } = await admin
      .from("user_entries")
      .delete()
      .eq("user_id", userId)
      .not("title_id", "in", `(${keepTitleIds.join(",")})`)
      .select("id");

    if (error) throw new Error(`Removal failed: ${error.message}`);
    removed = deleted?.length ?? 0;
  }

  // --- 5. Mark synced ------------------------------------------------------
  await admin
    .from("mal_connections")
    .update({ last_synced_at: now })
    .eq("user_id", userId);

  return {
    skipped: false,
    titles: titleRows.size,
    entries: entryRows.length,
    removed,
    pages,
    durationMs: Date.now() - startedAt,
  };
}
