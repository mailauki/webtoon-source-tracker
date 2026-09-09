import { describe, expect, it } from "vitest";

import { syncGenres } from "@/lib/sync/sync-list";

/** A Supabase-ish stub that records what each table was asked to do. */
function stubClient(
  options: {
    existingTags?: { id: number; mal_genre_id: number; slug: string; name: string }[];
    existingLinks?: { title_id: number; tag_id: number }[];
    /**
     * Makes an insert into `title_tags` fail with the given error code when
     * one of its rows matches `titleId`. Lets a test force exactly one
     * title's link write to hit a "someone else already inserted this" race
     * (23505) or a genuine failure (any other code) without touching the
     * others.
     */
    failInsertForTitleId?: number;
    failInsertCode?: string;
    failInsertMessage?: string;
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
          if (
            table === "title_tags" &&
            options.failInsertForTitleId !== undefined &&
            Array.isArray(rows) &&
            rows.some(
              (row: { title_id?: number }) => row.title_id === options.failInsertForTitleId,
            )
          ) {
            return Promise.resolve({
              error: {
                code: options.failInsertCode ?? "23505",
                message: options.failInsertMessage ?? "duplicate key value violates unique constraint",
              },
            });
          }
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

  it("tolerates a lost race (23505) on one title without failing the sync or other titles", async () => {
    // Links are written per title, not in one big batch, precisely so a lost
    // race on title 2 (someone else's concurrent sync inserted the same link
    // first) can't abort a statement that also carries titles 1 and 3. A
    // 23505 here means the row we wanted already exists — the desired end
    // state holds — so it must be swallowed, not thrown, and titles 1 and 3
    // must still get their links written.
    const client = stubClient({
      existingTags: [
        { id: 7, mal_genre_id: 22, slug: "romance", name: "Romance" },
        { id: 8, mal_genre_id: 23, slug: "comedy", name: "Comedy" },
        { id: 9, mal_genre_id: 24, slug: "action", name: "Action" },
      ],
      failInsertForTitleId: 102,
      failInsertCode: "23505",
    });

    await expect(
      syncGenres(
        client as never,
        [
          node(1, [{ id: 22, name: "Romance" }]),
          node(2, [{ id: 23, name: "Comedy" }]),
          node(3, [{ id: 24, name: "Action" }]),
        ],
        new Map([
          [1, 101],
          [2, 102],
          [3, 103],
        ]),
      ),
    ).resolves.toBeUndefined();

    const linkWrites = client.calls.filter((c) => c.table === "title_tags" && c.op === "insert");
    // One insert attempt per title — title 102's failed with 23505 but the
    // other two still went through.
    expect(linkWrites).toHaveLength(3);
    expect(linkWrites.flatMap((c) => c.rows as { title_id: number }[])).toEqual(
      expect.arrayContaining([
        { title_id: 101, tag_id: 7, owner_id: null },
        { title_id: 103, tag_id: 9, owner_id: null },
      ]),
    );
  });

  it("still propagates a non-23505 error from a link insert", async () => {
    // Only 23505 (unique_violation) is a "someone else already did this"
    // signal. Anything else — a dropped connection, a policy change, a
    // constraint we don't expect — is a genuine failure and must still throw,
    // or the try/catch at the syncMalList call site would swallow it in
    // exactly the way this fix exists to stop doing for lost races.
    const client = stubClient({
      failInsertForTitleId: 101,
      failInsertCode: "08006",
      failInsertMessage: "connection failure",
    });

    await expect(
      syncGenres(
        client as never,
        [node(1, [{ id: 22, name: "Romance" }])],
        new Map([[1, 101]]),
      ),
    ).rejects.toThrow("connection failure");
  });
});
