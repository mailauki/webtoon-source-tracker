import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { linkAniListIds } from "@/lib/anilist/catalog";

/**
 * Merging an AniList-only title into the MyAnimeList row for the same work.
 *
 * The merge itself is SQL (supabase/migrations/20261008120000_merge_duplicate_
 * titles.sql), so what is pinned here is the contract around it: the helper
 * sends the mapping in the shape the function reads, and both syncs call it at
 * the point where it has to run.
 */

function adminWith(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { admin: { rpc } as never, rpc };
}

describe("linkAniListIds", () => {
  it("sends each MAL id with its AniList id, and the user on MyAnimeList", async () => {
    const { admin, rpc } = adminWith({ data: 2, error: null });

    const merged = await linkAniListIds(
      admin,
      [
        { malMediaId: 5000, anilistMediaId: 9000 },
        { malMediaId: 5001, anilistMediaId: 9001 },
      ],
      "user-1",
    );

    expect(merged).toBe(2);
    expect(rpc).toHaveBeenCalledWith("link_anilist_ids", {
      p_links: [
        { mal_media_id: 5000, anilist_media_id: 9000 },
        { mal_media_id: 5001, anilist_media_id: 9001 },
      ],
      p_user_on_mal: "user-1",
    });
  });

  it("makes no round trip when there is nothing to link", async () => {
    const { admin, rpc } = adminWith({ data: 0, error: null });

    expect(await linkAniListIds(admin, [])).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  // The callers catch this so a failed merge never fails a sync — but they
  // can only do that if it is thrown rather than swallowed here.
  it("throws when the database refuses", async () => {
    const { admin } = adminWith({ data: null, error: { message: "boom" } });

    await expect(
      linkAniListIds(admin, [{ malMediaId: 1, anilistMediaId: 2 }]),
    ).rejects.toThrow("boom");
  });
});

describe("where the syncs merge", () => {
  // Before the entry upsert, not after: the user's copy has to be on the MAL
  // row by the time MAL's progress is written to it, or the upsert creates a
  // fresh entry and the merge then has two to reconcile.
  it("the MyAnimeList sync merges before writing entries, as the user on MAL", async () => {
    const source = await readFile("lib/sync/sync-list.ts", "utf8");

    const link = source.indexOf("await linkAniListIds(");
    const upsert = source.indexOf('.from("user_entries")\n      .upsert(');

    expect(link).toBeGreaterThan(-1);
    expect(upsert).toBeGreaterThan(link);
    expect(source.slice(link, upsert)).toContain("userId,");
  });

  // Before the catalog lookups, so the pull never sees the AniList-only row
  // it is about to lose. Never as the user on MAL: an AniList list says
  // nothing about what the user's MyAnimeList list holds.
  it("the AniList pull merges before reading the catalog, as nobody on MAL", async () => {
    const source = await readFile("lib/sync/sync-anilist.ts", "utf8");

    const link = source.indexOf("await linkAniListIds(");
    const lookup = source.indexOf('.from("media_titles")');

    expect(link).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(link);
    expect(source.slice(link, lookup)).not.toContain("userId");
  });
});

describe("the merge migration", () => {
  // Every table with a foreign key to media_titles. A new one added later
  // without a matching step here would make the final delete fail (restrict)
  // or silently drop rows (cascade), so the list is pinned.
  it("moves everything that points at a catalog row", async () => {
    const sql = await readFile(
      "supabase/migrations/20261008120000_merge_duplicate_titles.sql",
      "utf8",
    );

    for (const table of [
      "public.user_entries",
      "public.entry_sources",
      "public.collection_items",
      "public.title_tags",
    ]) {
      expect(sql).toContain(`update ${table}`);
    }
  });

  it("is callable by the server only", async () => {
    const sql = await readFile(
      "supabase/migrations/20261008120000_merge_duplicate_titles.sql",
      "utf8",
    );

    expect(sql).toMatch(
      /revoke all on function public\.link_anilist_ids\(jsonb, uuid\)\s+from public, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.link_anilist_ids\(jsonb, uuid\)\s+to service_role;/,
    );
  });
});
