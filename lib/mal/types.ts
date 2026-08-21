import { z } from "zod";

/**
 * Zod schemas for MAL API responses.
 *
 * MAL omits fields unpredictably — `main_picture` can be absent entirely, and
 * `num_chapters` is 0 for ongoing series — so everything optional is modelled
 * as optional rather than assumed present.
 */

export const MAL_LIST_STATUSES = [
  "reading",
  "completed",
  "on_hold",
  "dropped",
  "plan_to_read",
] as const;

export type MalListStatus = (typeof MAL_LIST_STATUSES)[number];

export const malUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  picture: z.string().optional(),
});

export type MalUser = z.infer<typeof malUserSchema>;

const mainPictureSchema = z
  .object({ medium: z.string().optional(), large: z.string().optional() })
  .optional();

export const malListStatusSchema = z.object({
  status: z.enum(MAL_LIST_STATUSES),
  score: z.number().default(0),
  num_volumes_read: z.number().default(0),
  num_chapters_read: z.number().default(0),
  is_rereading: z.boolean().default(false),
  updated_at: z.string().optional(),
});

export const malMangaNodeSchema = z.object({
  id: z.number(),
  title: z.string(),
  main_picture: mainPictureSchema,
  alternative_titles: z
    .object({
      synonyms: z.array(z.string()).optional(),
      en: z.string().optional(),
      ja: z.string().optional(),
    })
    .optional(),
  media_type: z.string().optional(),
  status: z.string().optional(),
  num_volumes: z.number().optional(),
  num_chapters: z.number().optional(),
});

export const malListEntrySchema = z.object({
  node: malMangaNodeSchema,
  list_status: malListStatusSchema.optional(),
});

export const malPagedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    paging: z
      .object({ previous: z.string().optional(), next: z.string().optional() })
      .default({}),
  });

export type MalMangaNode = z.infer<typeof malMangaNodeSchema>;
export type MalListEntry = z.infer<typeof malListEntrySchema>;
