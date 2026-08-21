import "server-only";

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
