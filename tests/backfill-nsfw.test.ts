import { describe, expect, it } from "vitest";

import { syncRatingsBatch } from "@/scripts/backfill-genres";

/**
 * Covers the content-rating half of scripts/backfill-genres.ts.
 *
 * Kept in its own file rather than folded into tests/backfill-genres.test.ts:
 * that suite exists to pin one specific contract — `ignoreDuplicates` on the
 * tag upsert — and its stub client is shaped entirely around tags. The rating
 * write touches a different table with a different verb, so mixing the two
 * would mean one stub pretending to be both.
 *
 * Importing the script does NOT run it, for the reason its header explains:
 * the module top level only defines functions, and run() is behind an
 * `import.meta.main` guard that is false under `import`.
 */

type Update = { table: string; values: unknown; malIds: unknown };

function stubClient(options: { failOn?: string } = {}) {
  const updates: Update[] = [];

  return {
    updates,
    from(table: string) {
      return {
        update: (values: { nsfw?: string }) => ({
          eq: () => ({
            in: (_column: string, malIds: unknown) => {
              updates.push({ table, values, malIds });
              return Promise.resolve({
                error:
                  values.nsfw === options.failOn
                    ? { message: "write failed" }
                    : null,
              });
            },
          }),
        }),
      };
    },
  };
}

/** `as never` for the stub, matching tests/backfill-genres.test.ts. */
const run = (
  client: ReturnType<typeof stubClient>,
  nodes: { id: number; nsfw?: string }[],
) => syncRatingsBatch(client as never, nodes);

describe("syncRatingsBatch (scripts/backfill-genres.ts)", () => {
  it("writes each rating once, for every title carrying it", async () => {
    const client = stubClient();

    await run(client, [
      { id: 1, nsfw: "white" },
      { id: 2, nsfw: "black" },
      { id: 3, nsfw: "white" },
    ]);

    expect(client.updates).toHaveLength(2);
    expect(client.updates).toContainEqual({
      table: "media_titles",
      values: { nsfw: "white" },
      malIds: [1, 3],
    });
    expect(client.updates).toContainEqual({
      table: "media_titles",
      values: { nsfw: "black" },
      malIds: [2],
    });
  });

  it("skips a title MAL sent no rating for rather than writing null", async () => {
    // The column is already null for those rows; writing null over null would
    // only move updated_at.
    const client = stubClient();

    await run(client, [{ id: 1 }, { id: 2, nsfw: undefined }]);

    expect(client.updates).toEqual([]);
  });

  it("writes nothing at all for an empty batch", async () => {
    const client = stubClient();
    await run(client, []);
    expect(client.updates).toEqual([]);
  });

  it("carries on when one rating's write fails", async () => {
    // The rating feeds one optional setting; failing the run would also lose
    // the genres this page already paid a MAL request each to fetch.
    const client = stubClient({ failOn: "gray" });

    await expect(
      run(client, [
        { id: 1, nsfw: "gray" },
        { id: 2, nsfw: "black" },
      ]),
    ).resolves.toBeUndefined();

    expect(client.updates).toHaveLength(2);
  });
});
