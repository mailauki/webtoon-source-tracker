import { z } from "zod";

/**
 * Zod schemas for the AniList GraphQL responses this app reads.
 *
 * GraphQL returns exactly the fields asked for, but AniList still sends null
 * for anything it does not know — a manga with no MAL counterpart has
 * `idMal: null`, an untouched entry has `progressVolumes: null` — so nullable
 * is modelled as nullable rather than assumed present.
 */

export const ANILIST_LIST_STATUSES = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "DROPPED",
  "PAUSED",
  "REPEATING",
] as const;

export type AniListListStatus = (typeof ANILIST_LIST_STATUSES)[number];

export const anilistViewerSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatar: z
    .object({ medium: z.string().nullable().optional() })
    .nullable()
    .optional(),
});

export type AniListViewer = z.infer<typeof anilistViewerSchema>;

export const anilistListEntrySchema = z.object({
  mediaId: z.number(),
  status: z.enum(ANILIST_LIST_STATUSES).nullable(),
  /** Requested as `score(format: POINT_10)`, so 0–10 whatever the user's format. */
  score: z.number().nullable(),
  progress: z.number().nullable(),
  progressVolumes: z.number().nullable(),
  /** Unix seconds, not milliseconds. 0 when AniList has never recorded one. */
  updatedAt: z.number().nullable(),
  /**
   * Enough of the title to build a catalog row from.
   *
   * The list pull needs this: a title that exists only on AniList has no MAL
   * node to read metadata from, so whatever the catalog stores for it has to
   * come from here. All optional — the fields ride the same query either way,
   * and an older cached response should still parse.
   */
  media: z.object({
    id: z.number(),
    idMal: z.number().nullable(),
    title: z
      .object({
        romaji: z.string().nullable(),
        english: z.string().nullable(),
      })
      .optional(),
    format: z.string().nullable().optional(),
    chapters: z.number().nullable().optional(),
    volumes: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    isAdult: z.boolean().nullable().optional(),
    coverImage: z
      .object({
        large: z.string().nullable(),
        medium: z.string().nullable(),
      })
      .nullable()
      .optional(),
  }),
});

export type AniListListEntry = z.infer<typeof anilistListEntrySchema>;

export const anilistListCollectionSchema = z.object({
  MediaListCollection: z
    .object({
      lists: z
        .array(z.object({ entries: z.array(anilistListEntrySchema).nullable() }))
        .nullable(),
      hasNextChunk: z.boolean().nullable(),
    })
    .nullable(),
});

export const anilistMediaIdPageSchema = z.object({
  Page: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean().nullable() }),
    media: z.array(z.object({ id: z.number(), idMal: z.number().nullable() })),
  }),
});

/**
 * A catalog search hit.
 *
 * `idMal` is what lets a hit be lined up against a MyAnimeList result — see
 * lib/data/cross-search.ts. AniList leaves it null for titles MAL has no entry
 * for, which is exactly the "AniList only" case the merged search reports.
 *
 * `chapters` is null for anything still running: AniList records the final
 * count, not the latest released chapter, so a disagreement with MAL's
 * `num_chapters` on an ongoing title is expected and must not be flagged.
 */
export const anilistSearchMediaSchema = z.object({
  id: z.number(),
  idMal: z.number().nullable(),
  title: z.object({
    romaji: z.string().nullable(),
    english: z.string().nullable(),
  }),
  format: z.string().nullable(),
  chapters: z.number().nullable(),
  volumes: z.number().nullable(),
  status: z.string().nullable(),
  isAdult: z.boolean().nullable(),
  coverImage: z
    .object({ large: z.string().nullable(), medium: z.string().nullable() })
    .nullable(),
});

export type AniListSearchMedia = z.infer<typeof anilistSearchMediaSchema>;

export const anilistSearchPageSchema = z.object({
  Page: z.object({
    media: z.array(anilistSearchMediaSchema),
  }),
});
