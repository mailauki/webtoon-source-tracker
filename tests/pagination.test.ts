import { describe, expect, it, vi } from "vitest";

import { readAllRows } from "@/lib/data/pagination";

/**
 * Cover for the read that outgrew PostgREST's row cap.
 *
 * The bug this exists for is silent by construction: a library over `max_rows`
 * came back as a 200 with exactly a thousand rows on it, and every consumer
 * treated that as the whole shelf. Nothing threw, nothing logged, and the rows
 * that went missing were the least-recently-updated ones — the ones a user is
 * least likely to go looking for.
 *
 * So these drive the loop against a fake PostgREST that enforces a cap the way
 * the real one does: it honours the requested range, truncates the page at the
 * cap, and reports the exact total alongside it regardless.
 */

type Row = { id: number };

/**
 * A stand-in for a range-paged table.
 *
 * `cap` is the server's `max_rows`: a page never comes back longer than this,
 * however wide a range was asked for. `count` is reported untruncated, which
 * is the real behaviour the loop leans on.
 */
function table(total: number, cap = 1000) {
  const page = vi.fn(async (from: number, to: number) => ({
    data: Array.from(
      { length: Math.max(0, Math.min(to - from + 1, cap, total - from)) },
      (_, i) => ({ id: from + i }),
    ),
    count: total,
    error: null,
  }));
  return page;
}

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("readAllRows", () => {
  it("costs one query for a result set inside the cap", async () => {
    const page = table(120);
    const rows = await readAllRows<Row>(page, "library");

    // The exact count is what buys this: the loop can tell it has everything
    // without a second request coming back empty to prove it.
    expect(rows).toHaveLength(120);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("keeps going past the cap until it has the whole set", async () => {
    const page = table(2400);
    const rows = await readAllRows<Row>(page, "library");

    expect(rows).toHaveLength(2400);
    expect(ids(rows).at(-1)).toBe(2399);
    expect(page).toHaveBeenCalledTimes(3);
  });

  // The boundary the old code fell off: a full page is indistinguishable from
  // a truncated one by its length alone. The count settles it — and settles it
  // without spending a second request to come back empty.
  it("does not ask again when the set lands exactly on the cap", async () => {
    const page = table(1000);
    const rows = await readAllRows<Row>(page, "library");

    expect(rows).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("requests each window from where the last one ended", async () => {
    const page = table(2400);
    await readAllRows<Row>(page, "library");

    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  // A project configured below PAGE_SIZE returns short pages. Advancing by
  // what came back rather than by what was asked for is what keeps that from
  // reading as the end of the data.
  it("survives a server cap smaller than the page size", async () => {
    const page = table(250, 100);
    const rows = await readAllRows<Row>(page, "library");

    expect(ids(rows)).toEqual(Array.from({ length: 250 }, (_, i) => i));
  });

  it("stops at the ceiling rather than paging forever", async () => {
    const page = table(9000);
    const rows = await readAllRows<Row>(page, "library");

    // The same 5,000 the sync enforces: a read that returned more would be
    // describing a library this app cannot produce.
    expect(rows).toHaveLength(5000);
    expect(page).toHaveBeenCalledTimes(5);
  });

  it("stops on an empty page even when the count disagrees", async () => {
    // A count that overstates what the rows can deliver would otherwise spin.
    const page = vi.fn(async () => ({ data: [], count: 4000, error: null }));
    const rows = await readAllRows<Row>(page, "library");

    expect(rows).toEqual([]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("falls back to a short page when no count came back", async () => {
    const page = vi.fn(async (from: number, to: number) => ({
      data: Array.from({ length: Math.max(0, Math.min(to - from + 1, 40)) }, (
        _,
        i,
      ) => ({ id: from + i })),
      count: null,
      error: null,
    }));
    const rows = await readAllRows<Row>(page, "library");

    expect(rows).toHaveLength(40);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("throws with the label, so a failure names the read", async () => {
    const page = vi.fn(async () => ({
      data: null,
      count: null,
      error: { message: "relation does not exist" },
    }));

    await expect(readAllRows<Row>(page, "library")).rejects.toThrow(
      "Failed to load library: relation does not exist",
    );
  });

  // Only the first page can be short-circuited by the count; a failure on a
  // later one must still surface rather than returning a partial shelf.
  it("throws on a failure partway through", async () => {
    const page = vi.fn(async (from: number, to: number) =>
      from === 0
        ? {
            data: Array.from({ length: to - from + 1 }, (_, i) => ({
              id: from + i,
            })),
            count: 3000,
            error: null,
          }
        : { data: null, count: null, error: { message: "timeout" } },
    );

    await expect(readAllRows<Row>(page, "library")).rejects.toThrow(
      "Failed to load library: timeout",
    );
  });
});
