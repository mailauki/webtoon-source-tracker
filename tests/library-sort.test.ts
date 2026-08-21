import { describe, expect, it } from "vitest";

import {
  DEFAULT_SORT,
  resolveSort,
  serializeSort,
  sortEntries,
  type Sort,
} from "@/lib/data/library-prefs";
import type { LibraryRow } from "@/lib/data/entries";

/** Only the fields the sort actually reads. */
function row(
  id: number,
  fields: {
    title?: string;
    read?: number;
    total?: number | null;
    added?: string | null;
    updated?: string | null;
  } = {},
): LibraryRow {
  return {
    id,
    num_chapters_read: fields.read ?? 0,
    created_at: fields.added ?? null,
    mal_updated_at: fields.updated ?? null,
    media_titles: {
      title: fields.title ?? `Title ${id}`,
      num_chapters: fields.total ?? null,
    },
  } as unknown as LibraryRow;
}

const ids = (rows: LibraryRow[]) => rows.map((r) => r.id);
const sort = (key: Sort["key"], direction: Sort["direction"] = "desc") =>
  ({ key, direction }) as Sort;

describe("resolveSort", () => {
  it("falls back to the default when nothing is stored", () => {
    expect(resolveSort(null)).toEqual(DEFAULT_SORT);
    expect(resolveSort(undefined)).toEqual(DEFAULT_SORT);
    expect(resolveSort("")).toEqual(DEFAULT_SORT);
  });

  it("parses a stored pair", () => {
    expect(resolveSort("added:asc")).toEqual({
      key: "added",
      direction: "asc",
    });
  });

  // A preference written by a version that offered a key this one dropped
  // must not throw on render.
  it("falls back rather than trusting an unrecognised value", () => {
    expect(resolveSort("bogus:asc")).toEqual(DEFAULT_SORT);
    expect(resolveSort("added:sideways")).toEqual(DEFAULT_SORT);
    expect(resolveSort("added")).toEqual(DEFAULT_SORT);
  });

  it("round-trips through serializeSort", () => {
    const value: Sort = { key: "progress", direction: "asc" };
    expect(resolveSort(serializeSort(value))).toEqual(value);
  });
});

describe("sortEntries", () => {
  it("does not mutate the array it is given", () => {
    const rows = [row(1, { title: "B" }), row(2, { title: "A" })];
    const before = ids(rows);
    sortEntries(rows, sort("title", "asc"));
    expect(ids(rows)).toEqual(before);
  });

  it("orders by date added, newest first", () => {
    const rows = [
      row(1, { added: "2026-01-01T00:00:00Z" }),
      row(2, { added: "2026-03-01T00:00:00Z" }),
      row(3, { added: "2026-02-01T00:00:00Z" }),
    ];
    expect(ids(sortEntries(rows, sort("added")))).toEqual([2, 3, 1]);
    expect(ids(sortEntries(rows, sort("added", "asc")))).toEqual([1, 3, 2]);
  });

  it("orders by date updated", () => {
    const rows = [
      row(1, { updated: "2026-05-01T00:00:00Z" }),
      row(2, { updated: "2026-04-01T00:00:00Z" }),
    ];
    expect(ids(sortEntries(rows, sort("updated")))).toEqual([1, 2]);
  });

  // Percent complete, not raw chapters: a long title read 12% through must
  // not outrank a short one that is finished.
  it("orders by percent complete rather than chapters read", () => {
    const rows = [
      row(1, { read: 100, total: 1000 }), // 10%
      row(2, { read: 10, total: 10 }), // 100%
      row(3, { read: 25, total: 50 }), // 50%
    ];
    expect(ids(sortEntries(rows, sort("progress")))).toEqual([2, 3, 1]);
    expect(ids(sortEntries(rows, sort("progress", "asc")))).toEqual([1, 3, 2]);
  });

  it("caps progress at 100% when the read count overruns the total", () => {
    const rows = [
      row(1, { read: 120, total: 100 }), // capped to 100%
      row(2, { read: 100, total: 100 }), // also 100%
      row(3, { read: 50, total: 100 }),
    ];
    // The two 100% rows tie, so the lower-progress row must come last.
    expect(ids(sortEntries(rows, sort("progress")))[2]).toBe(3);
  });

  it("sorts titles alphabetically, ignoring case", () => {
    const rows = [row(1, { title: "Zeta" }), row(2, { title: "apple" })];
    // A plain `<` would put "Zeta" first on char code alone.
    expect(ids(sortEntries(rows, sort("title", "asc")))).toEqual([2, 1]);
    expect(ids(sortEntries(rows, sort("title")))).toEqual([1, 2]);
  });
});

/**
 * Rows with no value for the active key go last in BOTH directions. Asking
 * for the least-read titles first is not a request to fill the top of the
 * grid with rows that have no progress at all.
 */
describe("rows missing a value", () => {
  it("puts an unknown chapter total last in both directions", () => {
    const rows = [
      row(1, { read: 40, total: null }), // still publishing: no percentage
      row(2, { read: 10, total: 100 }), // 10%
      row(3, { read: 90, total: 100 }), // 90%
    ];
    expect(ids(sortEntries(rows, sort("progress")))).toEqual([3, 2, 1]);
    expect(ids(sortEntries(rows, sort("progress", "asc")))).toEqual([2, 3, 1]);
  });

  it("puts a missing date last in both directions", () => {
    const rows = [
      row(1, { added: null }),
      row(2, { added: "2026-01-01T00:00:00Z" }),
      row(3, { added: "2026-02-01T00:00:00Z" }),
    ];
    expect(ids(sortEntries(rows, sort("added")))).toEqual([3, 2, 1]);
    expect(ids(sortEntries(rows, sort("added", "asc")))).toEqual([2, 3, 1]);
  });

  it("treats an unparseable date as missing rather than as epoch zero", () => {
    const rows = [
      row(1, { added: "not a date" }),
      row(2, { added: "2026-01-01T00:00:00Z" }),
    ];
    expect(ids(sortEntries(rows, sort("added", "asc")))).toEqual([2, 1]);
  });
});
