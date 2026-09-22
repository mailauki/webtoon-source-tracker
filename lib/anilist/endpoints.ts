import "server-only";

import type { AniListClient } from "./client";
import { AniListApiError } from "./errors";
import {
  anilistListCollectionSchema,
  anilistMediaIdPageSchema,
  anilistViewerSchema,
  type AniListListEntry,
  type AniListListStatus,
  type AniListViewer,
} from "./types";

export const VIEWER_QUERY = /* GraphQL */ `
  query {
    Viewer {
      id
      name
      avatar {
        medium
      }
    }
  }
`;

export async function getViewer(client: AniListClient): Promise<AniListViewer> {
  const raw = await client.request<{ Viewer: unknown }>(VIEWER_QUERY);
  return anilistViewerSchema.parse(raw.Viewer);
}

/**
 * `perChunk` maxes out at 500. The list comes back grouped into the user's
 * lists (Reading, Completed, custom lists…), and an entry on a custom list
 * appears once per list it is on, so callers must dedupe by mediaId.
 */
const LIST_QUERY = /* GraphQL */ `
  query ($userId: Int, $chunk: Int) {
    MediaListCollection(userId: $userId, type: MANGA, chunk: $chunk, perChunk: 500) {
      hasNextChunk
      lists {
        entries {
          mediaId
          status
          score(format: POINT_10)
          progress
          progressVolumes
          updatedAt
          media {
            id
            idMal
          }
        }
      }
    }
  }
`;

const MAX_CHUNKS = 10; // hard bound: 5,000 titles, the same as the MAL sync

/**
 * The user's whole AniList manga list, deduplicated by AniList media id.
 *
 * `complete` is false when the chunk bound was hit before AniList said there
 * was no more — the caller decides what a partial list is safe to do.
 */
export async function getMangaList(
  client: AniListClient,
  anilistUserId: number,
): Promise<{ entries: AniListListEntry[]; complete: boolean }> {
  const byMedia = new Map<number, AniListListEntry>();
  let complete = false;

  for (let chunk = 1; chunk <= MAX_CHUNKS; chunk++) {
    const raw = await client.request<unknown>(LIST_QUERY, {
      userId: anilistUserId,
      chunk,
    });
    const collection = anilistListCollectionSchema.parse(raw).MediaListCollection;

    for (const list of collection?.lists ?? []) {
      for (const entry of list.entries ?? []) byMedia.set(entry.mediaId, entry);
    }

    if (!collection?.hasNextChunk) {
      complete = true;
      break;
    }
  }

  return { entries: [...byMedia.values()], complete };
}

const MEDIA_BY_MAL_QUERY = /* GraphQL */ `
  query ($ids: [Int], $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo {
        hasNextPage
      }
      media(idMal_in: $ids, type: MANGA) {
        id
        idMal
      }
    }
  }
`;

/**
 * Resolves MAL manga ids to AniList media ids.
 *
 * Ids AniList has no entry for are simply absent from the result. Where
 * AniList has two entries claiming one MAL id, the first one returned wins.
 */
export async function findMediaByMalIds(
  client: AniListClient,
  malIds: number[],
): Promise<Map<number, number>> {
  const found = new Map<number, number>();
  const unique = [...new Set(malIds)];

  for (let i = 0; i < unique.length; i += 50) {
    const ids = unique.slice(i, i + 50);

    // A batch of 50 ids can still page if AniList has duplicates for some.
    for (let page = 1; page <= 5; page++) {
      const raw = await client.request<unknown>(MEDIA_BY_MAL_QUERY, { ids, page });
      const parsed = anilistMediaIdPageSchema.parse(raw).Page;

      for (const media of parsed.media) {
        if (media.idMal !== null && !found.has(media.idMal)) {
          found.set(media.idMal, media.id);
        }
      }
      if (!parsed.pageInfo.hasNextPage) break;
    }
  }

  return found;
}

export type AniListEntryWrite = {
  mediaId: number;
  status: AniListListStatus;
  progress: number;
  progressVolumes: number;
  /** 0–100, see toAniListScoreRaw. */
  scoreRaw: number;
};

/** Built per call so a batch can hold several aliased mutations. */
function saveMutation(count: number): string {
  const params: string[] = [];
  const fields: string[] = [];

  for (let i = 0; i < count; i++) {
    params.push(
      `$m${i}: Int, $s${i}: MediaListStatus, $p${i}: Int, $v${i}: Int, $r${i}: Int`,
    );
    fields.push(
      `e${i}: SaveMediaListEntry(mediaId: $m${i}, status: $s${i}, progress: $p${i}, progressVolumes: $v${i}, scoreRaw: $r${i}) { id }`,
    );
  }

  return `mutation (${params.join(", ")}) { ${fields.join(" ")} }`;
}

function saveVariables(writes: AniListEntryWrite[]) {
  const variables: Record<string, unknown> = {};
  writes.forEach((write, i) => {
    variables[`m${i}`] = write.mediaId;
    variables[`s${i}`] = write.status;
    variables[`p${i}`] = write.progress;
    variables[`v${i}`] = write.progressVolumes;
    variables[`r${i}`] = write.scoreRaw;
  });
  return variables;
}

/** Creates or updates one list entry. SaveMediaListEntry does both. */
export async function saveListEntry(
  client: AniListClient,
  write: AniListEntryWrite,
): Promise<void> {
  await client.request(saveMutation(1), saveVariables([write]));
}

/**
 * How many mutations ride in one request.
 *
 * Aliasing is what keeps a large sync inside AniList's per-minute request
 * quota — 200 updates are 20 requests, not 200 — and ten is small enough to
 * stay well under its query-complexity limit.
 */
const SAVE_BATCH_SIZE = 10;

/**
 * Saves many entries, batched.
 *
 * A batch that fails is retried one entry at a time, so a single entry AniList
 * rejects costs only itself. Auth and rate-limit errors are not retried that
 * way — they would fail identically for every entry — and propagate instead.
 * Returns how many entries were saved and which failed.
 */
export async function saveListEntries(
  client: AniListClient,
  writes: AniListEntryWrite[],
): Promise<{ saved: number; failed: AniListEntryWrite[] }> {
  let saved = 0;
  const failed: AniListEntryWrite[] = [];

  for (let i = 0; i < writes.length; i += SAVE_BATCH_SIZE) {
    const batch = writes.slice(i, i + SAVE_BATCH_SIZE);

    try {
      await client.request(saveMutation(batch.length), saveVariables(batch));
      saved += batch.length;
      continue;
    } catch (cause) {
      if (!(cause instanceof AniListApiError)) throw cause;
    }

    for (const write of batch) {
      try {
        await saveListEntry(client, write);
        saved++;
      } catch (cause) {
        if (!(cause instanceof AniListApiError)) throw cause;
        failed.push(write);
      }
    }
  }

  return { saved, failed };
}
