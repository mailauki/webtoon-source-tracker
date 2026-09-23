import "server-only";

import { anilistRequest, type AniListClient } from "./client";
import { AniListApiError } from "./errors";
import {
  anilistListCollectionSchema,
  anilistMediaIdPageSchema,
  anilistSearchMediaSchema,
  anilistSearchPageSchema,
  anilistViewerSchema,
  type AniListListEntry,
  type AniListListStatus,
  type AniListSearchMedia,
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

/**
 * AniList's manga formats that are prose rather than panels.
 *
 * The counterpart to NOVEL_KINDS in lib/data/search.ts, which holds MAL's
 * spelling of the same split. AniList uses one value where MAL uses two —
 * there is no separate "light novel" format — so both of MAL's map here.
 */
const NOVEL_FORMATS = new Set(["NOVEL"]);

/** Whether an AniList `format` is a novel. Unknown formats are not. */
export function isAniListNovel(format: string | null | undefined): boolean {
  return NOVEL_FORMATS.has(format ?? "");
}

const SEARCH_QUERY = /* GraphQL */ `
  query ($search: String, $perPage: Int, $isAdult: Boolean) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: MANGA, isAdult: $isAdult, sort: SEARCH_MATCH) {
        id
        idMal
        title {
          romaji
          english
        }
        format
        chapters
        volumes
        status
        isAdult
        coverImage {
          large
          medium
        }
      }
    }
  }
`;

/**
 * Searches the AniList catalog.
 *
 * Takes no client, by design. AniList serves catalog reads anonymously, so
 * this works for an account that has never connected AniList — the token is
 * only needed for Viewer and for writing list entries. That is what lets the
 * merged search answer in full regardless of what the user has linked.
 *
 * Adult titles are excluded by passing `isAdult: false`, which AniList filters
 * server-side. Unlike MAL there is no second local pass: `isAdult` is a
 * boolean AniList sets itself, not a rating string open to interpretation, and
 * it is returned on every hit so a caller can still check it.
 *
 * `sort: SEARCH_MATCH` orders by relevance to the term rather than by
 * popularity, which is what makes the first rows comparable to MAL's.
 */
export async function searchManga(
  query: string,
  perPage = 50,
  { includeMature = false }: { includeMature?: boolean } = {},
): Promise<AniListSearchMedia[]> {
  const raw = await anilistRequest<unknown>(null, SEARCH_QUERY, {
    search: query,
    perPage,
    // Undefined rather than true: passing `isAdult: true` would return ONLY
    // adult titles, where the intent is "do not filter them out".
    isAdult: includeMature ? undefined : false,
  });

  return anilistSearchPageSchema.parse(raw).Page.media;
}

const MEDIA_BY_ID_QUERY = /* GraphQL */ `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      id
      idMal
      title {
        romaji
        english
      }
      format
      chapters
      volumes
      status
      isAdult
      coverImage {
        large
        medium
      }
    }
  }
`;

/**
 * One title by its AniList id, or null if AniList no longer has it.
 *
 * Used by the AniList-only add path to re-read a title before storing it,
 * rather than trusting fields posted by the browser — the same reasoning that
 * has addEntry re-fetch the MAL node. Takes a client because that path already
 * requires a connected account to write with; the anonymous search above is
 * the read-only case.
 *
 * A missing title comes back as `Media: null` with an error attached, which
 * anilistRequest throws on, so that is caught and reported as null here.
 */
export async function getMediaById(
  client: AniListClient,
  mediaId: number,
): Promise<AniListSearchMedia | null> {
  let raw;
  try {
    raw = await client.request<{ Media: unknown }>(MEDIA_BY_ID_QUERY, {
      id: mediaId,
    });
  } catch (cause) {
    // Only a "not found" is swallowed. Auth and rate-limit errors must reach
    // the caller, which reports them differently.
    if (cause instanceof AniListApiError && cause.status === 404) return null;
    throw cause;
  }

  return raw.Media === null ? null : anilistSearchMediaSchema.parse(raw.Media);
}
