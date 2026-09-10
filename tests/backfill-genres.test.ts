import { describe, expect, it } from "vitest";

import { syncGenresBatch } from "@/scripts/backfill-genres";

/**
 * Pins scripts/backfill-genres.ts's copy of the tag-ownership contract:
 * `ignoreDuplicates: true` on the `mal_genre_id` upsert, so MAL can create a
 * tag but never modify one that already exists. That contract lives in two
 * places — lib/sync/sync-list.ts's syncGenres (pinned by
 * tests/sync-genres.test.ts) and this script's syncGenresBatch — because the
 * script can't import lib/sync/sync-list.ts (server-only + a TS parameter
 * property `--experimental-strip-types` can't parse; see the script's header
 * comment). A separate file, rather than extending sync-genres.test.ts,
 * because this one exercises a different module (a script, not a lib) reached
 * through a different path and guarded by import.meta.main — worth keeping
 * visually distinct even though the stub-client approach below is copied
 * from tests/sync-genres.test.ts.
 *
 * Importing scripts/backfill-genres.ts here does NOT run the script: its
 * module top level only defines functions/types, and the network-touching
 * run() is called solely inside an `if (import.meta.main)` guard, which is
 * false when this file reaches it via `import` rather than as the process
 * entry point (verified directly under this repo's
 * `node --experimental-strip-types` runner, both as a standalone check and by
 * this suite passing without needing any Supabase/MAL env vars set).
 */

/** Same stub shape as tests/sync-genres.test.ts's stubClient. */
function stubClient(
  options: {
    existingTags?: { id: number; mal_genre_id: number; slug: string; name: string }[];
    existingLinks?: { title_id: number; tag_id: number }[];
  } = {},
) {
  const calls: { table: string; op: string; rows: unknown; opts?: unknown }[] = [];
  const existingTags = options.existingTags ?? [
    { id: 7, mal_genre_id: 22, slug: "romance", name: "Renamed By Hand" },
  ];
  const existingLinks = options.existingLinks ?? [];

  return {
    calls,
    from(table: string) {
      return {
        upsert: (rows: unknown, opts?: unknown) => {
          calls.push({ table, op: "upsert", rows, opts });
          return Promise.resolve({ error: null });
        },
        insert: (rows: unknown) => {
          calls.push({ table, op: "insert", rows });
          return Promise.resolve({ error: null });
        },
        select: () => {
          if (table === "title_tags") {
            return {
              is: () => ({
                in: () => Promise.resolve({ data: existingLinks, error: null }),
              }),
            };
          }
          return {
            in: () => Promise.resolve({ data: existingTags, error: null }),
          };
        },
      };
    },
  };
}

const node = (id: number, genres?: { id: number; name: string }[]) => ({
  id,
  genres,
});

describe("syncGenresBatch (scripts/backfill-genres.ts)", () => {
  it("never overwrites an existing tag — ignoreDuplicates, not merge", async () => {
    // This is the one line the whole ownership model rests on. If a future
    // edit turns this into a merging upsert, an admin-renamed genre silently
    // reverts on the next `yarn backfill:genres`, and — absent this test —
    // nothing in the suite would notice, since this script's copy of the
    // contract is otherwise untested (unlike sync-list.ts's, pinned by
    // tests/sync-genres.test.ts).
    const client = stubClient();
    await syncGenresBatch(
      client as never,
      [node(1, [{ id: 22, name: "Romance" }])],
      new Map([[1, 101]]),
    );

    const tagUpsert = client.calls.find((c) => c.table === "tags");
    expect(tagUpsert?.opts).toMatchObject({
      onConflict: "mal_genre_id",
      ignoreDuplicates: true,
    });
  });

  it("creates a tag for each MAL genre and links it to the title", async () => {
    const client = stubClient();
    await syncGenresBatch(
      client as never,
      [node(1, [{ id: 22, name: "Romance" }])],
      new Map([[1, 101]]),
    );

    const tagUpsert = client.calls.find((c) => c.table === "tags");
    expect(tagUpsert?.rows).toEqual([
      expect.objectContaining({
        mal_genre_id: 22,
        name: "Romance",
        slug: "romance",
        kind: "genre",
      }),
    ]);

    const linkWrite = client.calls.find((c) => c.table === "title_tags");
    expect(linkWrite?.op).toBe("insert");
    expect(linkWrite?.rows).toEqual([{ title_id: 101, tag_id: 7, owner_id: null }]);
  });
});
