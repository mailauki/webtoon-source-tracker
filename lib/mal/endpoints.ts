import "server-only";

import { z } from "zod";

import { isMature } from "@/lib/data/nsfw";

import { malPublicRequest, type MalClient } from "./client";
import {
  malListEntrySchema,
  malListStatusSchema,
  malMangaNodeSchema,
  malPagedSchema,
  malUserSchema,
  type MalListStatus,
  type MalUser,
} from "./types";

/**
 * Fields requested for list entries — enough to render a card without extra
 * calls.
 *
 * TODO(authors): `authors{first_name,last_name}` is not here, so nothing in
 * the app knows who wrote a title and "more from this author" has no data to
 * stand on. The field rides these same pages, so asking for it costs no extra
 * requests — the work is where to store it. See TODO.md.
 */
const LIST_FIELDS =
  "list_status,alternative_titles,main_picture,num_chapters,num_volumes,media_type,status,genres,nsfw";

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
      // Deliberately the opposite of what searchManga does, and not a
      // mistake to tidy up: this is the user's *own* list. A title they put
      // there themselves must come back, or a sync would quietly drop rows
      // from their library and the app would look like it lost their data.
      // Hiding adult titles is a default for *discovery*, not censorship of
      // what someone already tracks.
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

/**
 * MAL's rating for an entry it considers explicit or borderline.
 *
 * The set and the rule for reading it live in lib/data/nsfw.ts, because
 * `media_titles.nsfw` now stores these same strings: a search result and a
 * shelf row have to be judged by one predicate, or the two surfaces disagree
 * about the same title. Re-exported here, where callers already look for it —
 * and imported above as well, since `searchManga` below applies it.
 */
export { isMature };

/**
 * Searches the MAL catalog for titles to add.
 *
 * Adult titles are left out by default, in two layers. `nsfw: false` asks MAL
 * to filter server-side, and `isMature` drops anything explicitly rated that
 * arrives anyway — MAL's own filter is not something this app can verify, and
 * the second check costs one comparison per row.
 *
 * This is deliberately *not* what `getMangaList` does. That syncs the user's
 * own list, where hiding a title would silently drop something they put there
 * themselves; a discovery search is the opposite case, where the default
 * should be the safe one. The flag is a parameter so an opt-in setting can
 * turn it off later without touching the call site's shape.
 *
 * `client` may be null, which searches with the app's client id instead of a
 * user token — see malPublicRequest. The NSFW layers above apply either way.
 */
export async function searchManga(
  client: MalClient | null,
  query: string,
  limit = 20,
  { includeMature = false }: { includeMature?: boolean } = {},
) {
  const params = { q: query, limit, fields: LIST_FIELDS, nsfw: includeMature };

  // A null client means nobody is connected: fall back to the app's own client
  // id, which MAL accepts for public catalog reads. Searching is discovery, so
  // it should not require handing over an account first.
  const raw = client
    ? await client.request<unknown>("/manga", { query: params })
    : await malPublicRequest<unknown>("/manga", params);
  const page = malPagedSchema(searchResultSchema).parse(raw);

  if (includeMature) return page;
  return { ...page, data: page.data.filter((item) => !isMature(item.node)) };
}

/**
 * Updates the user's list entry for a title.
 *
 * The body is form-encoded, NOT JSON — MAL rejects JSON here, and this is a
 * common source of silent 400s.
 *
 * TODO(remove-entry): the delete side of this is missing. MAL exposes
 * `DELETE /manga/{id}/my_list_status` and MalClient already accepts the
 * method, so a `deleteListStatus` belongs right here — what needs care is
 * everything downstream of it. See TODO.md.
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
