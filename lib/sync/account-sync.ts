import "server-only";

import { AniListClient } from "@/lib/anilist/client";
import {
  findMediaByMalIds,
  getMangaList as getAniListMangaList,
  saveListEntries,
  type AniListEntryWrite,
} from "@/lib/anilist/endpoints";
import { toAniListScoreRaw, toAniListStatus } from "@/lib/anilist/mapping";
import { MalClient } from "@/lib/mal/client";
import { updateListStatus } from "@/lib/mal/endpoints";
import { MalApiError, MalRateLimitError } from "@/lib/mal/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fromAniListEntry,
  fromMalEntry,
  planAccountSync,
  type AccountSyncResult,
  type ListState,
  type PlannedWrite,
  type SyncDirection,
} from "./plan-account-sync";
import { fetchMalList, syncMalList } from "./sync-list";

/**
 * Reconciles a user's MyAnimeList and AniList manga lists.
 *
 * Reads both lists in full, asks planAccountSync what to change, then writes
 * the changes to each service. The rules — never delete, skip what already
 * agrees, let the direction pick a winner — live in the planner; this file is
 * only the I/O around it.
 *
 * Afterwards the local library is refreshed from MAL, the same as a normal
 * sync. The cache still only ever mirrors MAL, so everything in
 * sync-list.ts (the removal guard included) is unchanged by AniList existing.
 */

/**
 * The most writes sent to either service in one run.
 *
 * A first sync between two long lists can mean hundreds of changes, and this
 * runs inside a server action with a finite time limit. Capping it keeps each
 * run short; the result reports what is left, and running again picks up
 * where it stopped, because what was written now agrees and is skipped.
 */
const MAX_WRITES_PER_SIDE = 150;

/** Pause between MAL writes. MAL publishes no quota, so be conservative. */
const MAL_WRITE_GAP_MS = 250;

/**
 * How long MAL writes may run before the rest are left for the next run.
 *
 * MAL takes one request per title, so it is the slow half; AniList batches
 * ten per request and is bounded by the count cap alone. The settings page
 * sets `maxDuration = 60` for the action, and this leaves room inside that
 * for the list reads before and the library refresh after.
 */
const MAL_WRITE_BUDGET_MS = 30_000;

const BATCH_SIZE = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type { AccountSyncResult };

/** Thrown when either connection is missing or not active. */
export class AccountSyncUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountSyncUnavailableError";
  }
}

function toAniListWrite(mediaId: number, state: ListState): AniListEntryWrite {
  return {
    mediaId,
    status: toAniListStatus(state.status, state.rereading),
    progress: state.chapters,
    progressVolumes: state.volumes,
    scoreRaw: toAniListScoreRaw(state.score),
  };
}

export async function syncAccounts(
  userId: string,
  direction: SyncDirection,
): Promise<AccountSyncResult> {
  const admin = createAdminClient();

  const [{ data: mal }, { data: anilist }] = await Promise.all([
    admin.from("mal_connections").select("status").eq("user_id", userId).maybeSingle(),
    admin
      .from("anilist_connections")
      .select("status, anilist_user_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (mal?.status !== "active") {
    throw new AccountSyncUnavailableError("Connect MyAnimeList first.");
  }
  if (anilist?.status !== "active") {
    throw new AccountSyncUnavailableError("Connect AniList first.");
  }

  const malClient = new MalClient(userId);
  const anilistClient = new AniListClient(userId);

  // --- 1. Read both lists --------------------------------------------------
  const [malList, anilistList] = await Promise.all([
    fetchMalList(malClient),
    getAniListMangaList(anilistClient, anilist.anilist_user_id),
  ]);

  const malStates = new Map<number, ListState>();
  for (const entry of malList.entries) {
    const state = fromMalEntry(entry);
    if (state) malStates.set(entry.node.id, state);
  }

  const anilistStates = new Map<number, ListState>();
  // MAL id -> AniList id, for the titles AniList already has on the list.
  const anilistIds = new Map<number, number>();
  let unmatched = 0;

  for (const entry of anilistList.entries) {
    // No MAL counterpart: nothing to match it against, and no way to write it
    // to MAL. Counted so the result can say so rather than hide it.
    if (entry.media.idMal === null) {
      unmatched++;
      continue;
    }
    const state = fromAniListEntry(entry);
    if (!state) continue;
    anilistStates.set(entry.media.idMal, state);
    anilistIds.set(entry.media.idMal, entry.media.id);
  }

  // --- 2. Plan ---------------------------------------------------------------
  // A list cut short by the page bound (5,000+ titles) is passed along as
  // such: the planner will not copy onto a side it cannot see all of.
  const plan = planAccountSync(malStates, anilistStates, direction, {
    mal: malList.complete,
    anilist: anilistList.complete,
  });

  const toMal: PlannedWrite[] = [];
  const toAniList: PlannedWrite[] = [];
  for (const write of plan.writes) {
    (write.target === "mal" ? toMal : toAniList).push(write);
  }

  // Titles going to AniList that it does not have on the list yet need their
  // AniList id looked up (50 per request). Resolved before the cap is
  // applied, so titles AniList has no entry for never take up a run's slots —
  // otherwise enough of them at the front would stall every later run.
  const unknown = toAniList
    .map((w) => w.malId)
    .filter((malId) => !anilistIds.has(malId));

  if (unknown.length > 0) {
    const resolved = await findMediaByMalIds(anilistClient, unknown);
    for (const [malId, anilistId] of resolved) anilistIds.set(malId, anilistId);
  }

  // --- 3. Write to AniList -------------------------------------------------
  const anilistWrites: AniListEntryWrite[] = [];
  for (const write of toAniList) {
    const mediaId = anilistIds.get(write.malId);
    if (mediaId === undefined) {
      unmatched++;
      continue;
    }
    anilistWrites.push(toAniListWrite(mediaId, write.state));
  }

  const anilistBatch = anilistWrites.slice(0, MAX_WRITES_PER_SIDE);
  const anilistResult = await saveListEntries(anilistClient, anilistBatch);
  let remaining = anilistWrites.length - anilistBatch.length;
  let failed = anilistResult.failed.length;

  // --- 4. Write to MAL -----------------------------------------------------
  const malBatch = toMal.slice(0, MAX_WRITES_PER_SIDE);
  remaining += toMal.length - malBatch.length;
  let malSaved = 0;
  const malDeadline = Date.now() + MAL_WRITE_BUDGET_MS;

  for (let i = 0; i < malBatch.length; i++) {
    if (Date.now() > malDeadline) {
      remaining += malBatch.length - i;
      break;
    }

    const { malId, state } = malBatch[i];
    try {
      await updateListStatus(malClient, malId, {
        status: state.status,
        num_chapters_read: state.chapters,
        num_volumes_read: state.volumes,
        score: state.score,
        is_rereading: state.rereading,
      });
      malSaved++;
    } catch (cause) {
      // Over quota: stop, and leave the rest for the next run rather than
      // hammering an API that has already said no.
      if (cause instanceof MalRateLimitError) {
        remaining += malBatch.length - i;
        break;
      }
      // One title MAL refuses (a removed entry, a value it will not take)
      // should not sink the rest. Auth failures still propagate.
      if (cause instanceof MalApiError) {
        failed++;
        continue;
      }
      throw cause;
    }
    if (i < malBatch.length - 1) await sleep(MAL_WRITE_GAP_MS);
  }

  // --- 5. Remember the AniList ids -----------------------------------------
  // Progress edits mirror to AniList (see lib/anilist/mirror.ts), and every id
  // cached here is a lookup that mirror no longer has to make. Best-effort:
  // the sync itself already succeeded.
  try {
    await cacheAniListIds(admin, anilistIds);
  } catch (error) {
    console.error("[account-sync] caching AniList ids failed:", error);
  }

  // --- 6. Refresh the local mirror ------------------------------------------
  // The writes above already landed on both sites, so a failure here must not
  // turn the result into an error: the library's own Sync button (or its
  // staleness check) catches the mirror up later.
  if (malSaved > 0) {
    try {
      await syncMalList(userId, { force: true });
    } catch (error) {
      console.error("[account-sync] refreshing the library failed:", error);
    }
  }

  await admin
    .from("anilist_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return {
    toMal: malSaved,
    toAniList: anilistResult.saved,
    inSync: plan.inSync,
    unmatched,
    remaining,
    failed,
  };
}

/**
 * Stores AniList ids on catalog rows that do not have one yet.
 *
 * An upsert on the MAL key rather than one UPDATE per row, so a first sync of
 * a long list is a handful of round trips. Only rows already in the catalog
 * and still missing the id are sent, and `title` is sent back unchanged — it
 * is only there because the insert half of an upsert needs it.
 */
async function cacheAniListIds(
  admin: ReturnType<typeof createAdminClient>,
  anilistIds: Map<number, number>,
): Promise<void> {
  const malIds = [...anilistIds.keys()];

  for (let i = 0; i < malIds.length; i += BATCH_SIZE) {
    const batch = malIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await admin
      .from("media_titles")
      .select("mal_media_id, title")
      .eq("media_type", "manga")
      .is("anilist_media_id", null)
      .in("mal_media_id", batch);

    if (error) throw new Error(`AniList id lookup failed: ${error.message}`);
    if (!data || data.length === 0) continue;

    const { error: upsertError } = await admin.from("media_titles").upsert(
      // Filtered rather than asserted: the query above selects by
      // `mal_media_id`, so a null cannot occur, but the column is nullable now
      // that AniList-only titles share this table and an upsert keyed on a
      // null id would not match the partial unique index.
      data
        .filter((row) => row.mal_media_id !== null)
        .map((row) => ({
          media_type: "manga",
          mal_media_id: row.mal_media_id,
          title: row.title,
          anilist_media_id: anilistIds.get(row.mal_media_id!) ?? null,
        })),
      { onConflict: "media_type,mal_media_id" },
    );

    if (upsertError) throw new Error(`AniList id cache failed: ${upsertError.message}`);
  }
}
