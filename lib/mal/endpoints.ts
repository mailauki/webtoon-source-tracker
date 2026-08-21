import "server-only";

import { z } from "zod";

import type { MalClient } from "./client";
import {
  malListEntrySchema,
  malListStatusSchema,
  malMangaNodeSchema,
  malPagedSchema,
  malUserSchema,
  type MalListStatus,
  type MalUser,
} from "./types";

/** Fields requested for list entries — enough to render a card without extra calls. */
const LIST_FIELDS =
  "list_status,alternative_titles,main_picture,num_chapters,num_volumes,media_type,status";

/** Search returns bare nodes, not the {node, list_status} pairs the list uses. */
const searchResultSchema = z.object({ node: malMangaNodeSchema });

export async function getMe(client: MalClient): Promise<MalUser> {
  const raw = await client.request<unknown>("/users/@me", {
    query: { fields: "id,name,picture" },
  });
  return malUserSchema.parse(raw);
}

/**
 * One page of the user's manga list.
 *
 * `limit` maxes out at 100 on MAL's side. Sorting by list_updated_at puts the
 * most relevant titles first, which matters if a very long list is truncated.
 */
export async function getMangaList(
  client: MalClient,
  options: {
    limit?: number;
    offset?: number;
    status?: MalListStatus;
    sort?: "list_score" | "list_updated_at" | "manga_title" | "manga_start_date";
  } = {},
) {
  const raw = await client.request<unknown>("/users/@me/mangalist", {
    query: {
      fields: LIST_FIELDS,
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
      status: options.status,
      sort: options.sort ?? "list_updated_at",
      nsfw: true,
    },
  });

  return malPagedSchema(malListEntrySchema).parse(raw);
}

export async function getManga(client: MalClient, mangaId: number) {
  const raw = await client.request<unknown>(`/manga/${mangaId}`, {
    query: { fields: LIST_FIELDS },
  });
  return malMangaNodeSchema.parse(raw);
}

export async function searchManga(client: MalClient, query: string, limit = 20) {
  const raw = await client.request<unknown>("/manga", {
    query: { q: query, limit, fields: LIST_FIELDS, nsfw: true },
  });
  return malPagedSchema(searchResultSchema).parse(raw);
}

/**
 * Updates the user's list entry for a title.
 *
 * The body is form-encoded, NOT JSON — MAL rejects JSON here, and this is a
 * common source of silent 400s.
 */
export async function updateListStatus(
  client: MalClient,
  mangaId: number,
  patch: {
    status?: MalListStatus;
    num_chapters_read?: number;
    num_volumes_read?: number;
    score?: number;
    is_rereading?: boolean;
  },
) {
  const raw = await client.request<unknown>(
    `/manga/${mangaId}/my_list_status`,
    { method: "PUT", form: patch },
  );

  // MAL echoes the stored values, which may be clamped (e.g. chapters capped
  // at num_chapters). Callers should persist THIS, not their optimistic guess.
  return malListStatusSchema.parse(raw);
}
