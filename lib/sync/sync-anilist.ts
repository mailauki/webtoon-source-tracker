import "server-only";

import { AniListClient } from "@/lib/anilist/client";
import { getMangaList } from "@/lib/anilist/endpoints";
import { upsertAniListTitle } from "@/lib/anilist/catalog";
import { toMalScore, toMalStatus } from "@/lib/anilist/mapping";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStale } from "./staleness";

/**
 * Pulls a user's AniList manga list into Supabase.
 *
 * The counterpart to syncMalList, and deliberately NOT a copy of it. Three
 * things differ, and each one is a rule rather than a detail:
 *
 *  1. It never deletes. syncMalList removes entries MyAnimeList did not
 *     return, because for a MAL-backed title MAL is the source of truth. That
 *     reasoning does not transfer: a title missing from AniList may simply be
 *     one the user tracks on MAL alone, and deleting it here would destroy an
 *     entry — and its hand-entered entry_sources — on the say-so of a site
 *     that was never authoritative for it.
 *
 *  2. It does not overwrite progress on titles MAL also has. Those rows are
 *     MAL's to own, and syncMalList runs alongside this one; writing AniList's
 *     numbers over them would make the two syncs fight, with the last to run
 *     winning. Only AniList-only rows take their progress from here.
 *
 *  3. It matches on `idMal` first and `anilist_media_id` second. The first is
 *     how an AniList entry lines up with a title the catalog already holds
 *     from MAL; the second is the only handle an AniList-only title has.
 *
 * What it is for is the case nothing else covers: a title added on anilist.co
 * that this app has never seen.
 */

/** What the pull should do with one AniList list entry. */
export type PullAction =
  /** Nothing here knows this title: create the catalog row and the entry. */
  | "create"
  /** The catalog has it as an AniList-only row: create the entry only. */
  | "entry_only"
  /** MyAnimeList owns this title's progress — leave it entirely alone. */
  | "skip_mal_backed";

/**
 * What to do with one entry from the user's AniList list.
 *
 * The whole policy of this module in one function, kept pure so the two rules
 * that matter can be asserted without a database:
 *
 *  - A title MyAnimeList also has is never written from here. syncMalList owns
 *    those rows and runs alongside this pull; writing AniList's numbers over
 *    them would make the two syncs fight, with whichever ran last winning.
 *  - A title only AniList has is created, because nothing else ever will.
 *
 * `idMal` is what decides it — the id AniList itself publishes — not whether
 * the catalog happens to hold a MAL row yet. An entry carrying a MAL id that
 * the catalog has not seen is still MAL's, and syncMalList will bring it in
 * with MAL's own metadata rather than AniList's approximation of it.
 */
export function pullActionFor(
  entry: { idMal: number | null },
  knownAnilistOnly: boolean,
): PullAction {
  if (entry.idMal !== null) return "skip_mal_backed";
  return knownAnilistOnly ? "entry_only" : "create";
}

export type AniListSyncResult = {
  skipped: boolean;
  /** Catalog rows created for titles the app had never seen. */
  titlesAdded: number;
  /** user_entries rows created. Never updated-in-place for MAL-backed titles. */
  entriesAdded: number;
  complete: boolean;
  durationMs: number;
};

const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function syncAniListList(
  userId: string,
  options: { force?: boolean } = {},
): Promise<AniListSyncResult> {
  const startedAt = Date.now();
  const admin = createAdminClient();

  const empty = (skipped: boolean): AniListSyncResult => ({
    skipped,
    titlesAdded: 0,
    entriesAdded: 0,
    complete: false,
    durationMs: Date.now() - startedAt,
  });

  const { data: connection } = await admin
    .from("anilist_connections")
    .select("status, anilist_user_id, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection || connection.status !== "active") return empty(true);
  if (!options.force && !isStale(connection.last_synced_at)) return empty(true);

  const client = new AniListClient(userId);
  const { entries, complete } = await getMangaList(
    client,
    connection.anilist_user_id,
  );

  if (entries.length === 0) {
    await admin
      .from("anilist_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { ...empty(false), complete };
  }

  const now = new Date().toISOString();

  // --- 1. Which of these the catalog already knows --------------------------
  //
  // Two lookups, because an AniList entry can match an existing row either
  // way: by the MAL id it carries (the common case, for a title both sites
  // have) or by its own id (the only handle an AniList-only title has).
  const malIds = entries.flatMap((e) =>
    e.media.idMal === null ? [] : [e.media.idMal],
  );
  const anilistIds = entries.map((e) => e.mediaId);

  const known = new Map<number, { id: number; malBacked: boolean }>();

  for (const batch of chunk(malIds, BATCH_SIZE)) {
    const { data, error } = await admin
      .from("media_titles")
      .select("id, mal_media_id, anilist_media_id")
      .eq("media_type", "manga")
      .in("mal_media_id", batch);

    if (error) throw new Error(`Catalog lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      // Keyed by AniList id where we have it, so the entry loop below can find
      // the row without re-deriving the mapping.
      if (row.anilist_media_id !== null) {
        known.set(row.anilist_media_id, { id: row.id, malBacked: true });
      }
    }
  }

  for (const batch of chunk(anilistIds, BATCH_SIZE)) {
    const { data, error } = await admin
      .from("media_titles")
      .select("id, mal_media_id, anilist_media_id")
      .eq("media_type", "manga")
      .in("anilist_media_id", batch);

    if (error) throw new Error(`Catalog lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      if (row.anilist_media_id !== null) {
        known.set(row.anilist_media_id, {
          id: row.id,
          malBacked: row.mal_media_id !== null,
        });
      }
    }
  }

  // --- 2. Create catalog rows for titles nothing has seen -------------------
  //
  // Only AniList-only titles are created here. An entry carrying a MAL id that
  // the catalog does not hold is left alone: syncMalList owns those rows, and
  // creating one here would mean writing a MAL-backed row from AniList's
  // metadata, which then disagrees with MAL until the next MAL sync.
  const newTitles = entries.filter(
    (e) => pullActionFor(e.media, known.has(e.mediaId)) === "create",
  );

  let titlesAdded = 0;

  // One row at a time rather than a batch: these go through the
  // media_titles_upsert_anilist RPC, which restates the partial index's
  // predicate so ON CONFLICT can use it — see lib/anilist/catalog.ts. A
  // per-row call is the cost of that, and it is paid only for titles nothing
  // in the app has seen before, which is a small set after the first sync.
  for (const entry of newTitles) {
    const id = await upsertAniListTitle(admin, {
      anilistMediaId: entry.mediaId,
      title:
        entry.media.title?.romaji ?? entry.media.title?.english ?? "Untitled",
      titleEn: entry.media.title?.english ?? null,
      coverUrl:
        entry.media.coverImage?.large ?? entry.media.coverImage?.medium ?? null,
      format: entry.media.format ?? null,
      countryOfOrigin: entry.media.countryOfOrigin ?? null,
      chapters: entry.media.chapters ?? null,
      volumes: entry.media.volumes ?? null,
      status: entry.media.status ?? null,
      isAdult: entry.media.isAdult ?? null,
    });

    known.set(entry.mediaId, { id, malBacked: false });
    titlesAdded++;
  }

  // --- 3. Create the user's entries ----------------------------------------
  //
  // ignoreDuplicates, not a merge: an entry that already exists is either
  // MAL's to own (rule 2 above) or already carries this user's progress, and
  // neither should be overwritten by a pull. This step only fills in titles
  // the user tracks on AniList and did not have here at all.
  const entryRows = entries.flatMap((e) => {
    const title = known.get(e.mediaId);
    if (!title) return [];

    // MAL-backed rows keep MAL's progress; syncMalList writes those. Checked
    // against the catalog row as well as the entry, since a row can be
    // MAL-backed while the AniList entry that matched it carries no idMal.
    if (title.malBacked) return [];
    if (pullActionFor(e.media, true) === "skip_mal_backed") return [];

    const mapped = e.status ? toMalStatus(e.status) : null;

    return [
      {
        user_id: userId,
        title_id: title.id,
        list_status: mapped?.status ?? ("plan_to_read" as const),
        num_chapters_read: e.progress ?? 0,
        num_volumes_read: e.progressVolumes ?? 0,
        score: toMalScore(e.score),
        is_rereading: mapped?.is_rereading ?? false,
        // Despite the name, this column is "when the user last touched this
        // entry on the service that owns it" — it is what the library's
        // default sort, the collections list and pick-random all read. Leaving
        // it null for an AniList-only row does not merely lose precision: rows
        // with no value sort LAST in both directions, so a title added
        // moments ago would sit at the bottom of the grid, and pick-random
        // would read the same null as "never touched" and over-recommend it.
        // AniList sends seconds, not milliseconds.
        mal_updated_at: e.updatedAt
          ? new Date(e.updatedAt * 1000).toISOString()
          : now,
        synced_at: now,
      },
    ];
  });

  let entriesAdded = 0;

  // ignoreDuplicates already protects an archived row from being overwritten —
  // it has a (user_id, title_id) row, so the insert is skipped — which means a
  // title the user removed does not come back through this path.
  for (const batch of chunk(entryRows, BATCH_SIZE)) {
    const { data, error } = await admin
      .from("user_entries")
      .upsert(batch, {
        onConflict: "user_id,title_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) throw new Error(`Entry upsert failed: ${error.message}`);
    entriesAdded += data?.length ?? 0;
  }

  // Deliberately no removal step. See the header: AniList is not authoritative
  // for anything except the titles only it has, and even those may be tracked
  // here after being removed there.

  await admin
    .from("anilist_connections")
    .update({ last_synced_at: now })
    .eq("user_id", userId);

  return {
    skipped: false,
    titlesAdded,
    entriesAdded,
    complete,
    durationMs: Date.now() - startedAt,
  };
}
