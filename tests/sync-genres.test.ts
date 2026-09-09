import { describe, expect, it } from "vitest";

import { syncGenres } from "@/lib/sync/sync-list";

/** A Supabase-ish stub that records what each table was asked to do. */
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
            // Mirrors the real chain: .select(...).is("owner_id", null).in("title_id", batch)
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
  title: `Title ${id}`,
  genres,
});

describe("syncGenres", () => {
  it("creates a tag for each MAL genre and links it to the title", async () => {
    const client = stubClient();
    await syncGenres(
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
  });

  it("never overwrites an existing tag — ignoreDuplicates, not merge", async () => {
    // The whole ownership model is this one option. If a future edit turns it
    // into a merging upsert, a locally renamed genre silently reverts on the
    // next sync, and nothing else in the suite would notice.
    const client = stubClient();
    await syncGenres(
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

  it("does nothing when MAL omits genres", async () => {
    // MAL omits fields unpredictably; a missing genre list is normal and must
    // not fail the sync.
    const client = stubClient();
    await syncGenres(client as never, [node(1)], new Map([[1, 101]]));
    expect(client.calls).toEqual([]);
  });

  it("skips a title with no catalog id rather than writing a null title_id", async () => {
    const client = stubClient();
    await syncGenres(
      client as never,
      [node(99, [{ id: 22, name: "Romance" }])],
      new Map(),
    );
    expect(client.calls.find((c) => c.table === "title_tags")).toBeUndefined();
  });

  it("deduplicates a genre that appears on several titles", async () => {
    const client = stubClient();
    await syncGenres(
      client as never,
      [
        node(1, [{ id: 22, name: "Romance" }]),
        node(2, [{ id: 22, name: "Romance" }]),
      ],
      new Map([[1, 101], [2, 102]]),
    );

    const tagUpsert = client.calls.find((c) => c.table === "tags");
    expect(tagUpsert?.rows).toHaveLength(1);
  });

  it("writes new curated links with insert, not upsert with onConflict", async () => {
    // PostgREST's on_conflict param can only ever become `ON CONFLICT
    // (columns)` — a bare column list, no WHERE predicate — so it cannot
    // target the partial index that actually dedupes curated title_tags rows
    // (migration 20260909000002, `where owner_id is null`). If this ever
    // reverts to `.upsert(..., { onConflict: "title_id,tag_id" })`, every
    // sync goes back to duplicating every genre link, silently, because that
    // onConflict spelling doesn't match any real constraint on this table.
    const client = stubClient();
    await syncGenres(
      client as never,
      [node(1, [{ id: 22, name: "Romance" }])],
      new Map([[1, 101]]),
    );

    const linkWrite = client.calls.find((c) => c.table === "title_tags");
    expect(linkWrite?.op).toBe("insert");
    expect(linkWrite?.opts).toBeUndefined();
    expect(linkWrite?.rows).toEqual([{ title_id: 101, tag_id: 7, owner_id: null }]);
  });

  it("does not re-insert a curated link that already exists", async () => {
    // The dedupe that keeps a resync from duplicating every genre chip: read
    // existing curated links for the affected titles first, then insert only
    // what's missing. Without this, the earlier "no onConflict" fix would
    // just move the duplication bug from Postgres silently ignoring a
    // mismatched conflict target to this function blindly inserting rows
    // Postgres would then reject one-by-one (or worse, accept, if the
    // partial index were ever dropped).
    const client = stubClient({
      existingLinks: [{ title_id: 101, tag_id: 7 }],
    });
    await syncGenres(
      client as never,
      [node(1, [{ id: 22, name: "Romance" }])],
      new Map([[1, 101]]),
    );

    expect(client.calls.find((c) => c.table === "title_tags")).toBeUndefined();
  });

  it("inserts only the missing link when a title has several genres and one is already linked", async () => {
    const client = stubClient({
      existingTags: [
        { id: 7, mal_genre_id: 22, slug: "romance", name: "Romance" },
        { id: 8, mal_genre_id: 23, slug: "comedy", name: "Comedy" },
      ],
      existingLinks: [{ title_id: 101, tag_id: 7 }],
    });
    await syncGenres(
      client as never,
      [
        node(1, [
          { id: 22, name: "Romance" },
          { id: 23, name: "Comedy" },
        ]),
      ],
      new Map([[1, 101]]),
    );

    const linkWrite = client.calls.find((c) => c.table === "title_tags");
    expect(linkWrite?.rows).toEqual([{ title_id: 101, tag_id: 8, owner_id: null }]);
  });
});
