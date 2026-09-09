import { describe, expect, it } from "vitest";

import { syncGenres } from "@/lib/sync/sync-list";

/** A Supabase-ish stub that records what each table was asked to do. */
function stubClient() {
  const calls: { table: string; op: string; rows: unknown; opts?: unknown }[] = [];
  const existingTags = [
    { id: 7, mal_genre_id: 22, slug: "romance", name: "Renamed By Hand" },
  ];

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
        select: () => ({
          in: () => Promise.resolve({ data: existingTags, error: null }),
        }),
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
});
