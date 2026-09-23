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
  media: z.object({
    id: z.number(),
    idMal: z.number().nullable(),
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
