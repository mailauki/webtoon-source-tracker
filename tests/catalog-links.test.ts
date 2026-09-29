import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving a search's name matches onto the catalog.
 *
 * The rule under test is the condition, not the write: a name match may only
 * fill an empty `anilist_media_id`, never replace one AniList itself linked.
 */

type Call = { update: unknown; filters: [string, string, unknown][] };

const { calls, from, result } = vi.hoisted(() => {
  const calls: Call[] = [];
  const result = { error: null as { message: string } | null };
  const from = vi.fn(() => {
    const call: Call = { update: null, filters: [] };
    calls.push(call);
    const builder = {
      update(values: unknown) {
        call.update = values;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.filters.push(["eq", column, value]);
        return builder;
      },
      is(column: string, value: unknown) {
        call.filters.push(["is", column, value]);
        return builder;
      },
      then(resolve: (value: { error: unknown }) => void) {
        resolve({ error: result.error });
      },
    };
    return builder;
  });
  return { calls, from, result };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

import { rememberNameMatches } from "@/lib/data/catalog-links";

beforeEach(() => {
  calls.length = 0;
  from.mockClear();
  result.error = null;
});

describe("rememberNameMatches", () => {
  it("fills an empty AniList id on the MAL title's row, and only an empty one", async () => {
    await rememberNameMatches([{ malMediaId: 7, anilistMediaId: 700 }]);

    expect(from).toHaveBeenCalledWith("media_titles");
    expect(calls).toEqual([
      {
        update: { anilist_media_id: 700 },
        filters: [
          ["eq", "media_type", "manga"],
          ["eq", "mal_media_id", 7],
          ["is", "anilist_media_id", null],
        ],
      },
    ]);
  });

  it("writes nothing without a match, and caps a large batch", async () => {
    await rememberNameMatches([]);
    expect(from).not.toHaveBeenCalled();

    await rememberNameMatches(
      Array.from({ length: 25 }, (_, i) => ({ malMediaId: i + 1, anilistMediaId: i + 100 })),
    );
    expect(calls).toHaveLength(10);
  });

  it("logs a failed write rather than throwing it", async () => {
    result.error = { message: "boom" };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      rememberNameMatches([{ malMediaId: 7, anilistMediaId: 700 }]),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[catalog-links] save failed:", "boom");
  });
});
