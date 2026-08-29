import { describe, expect, it } from "vitest";

import type { LibraryRow } from "@/lib/data/entries";
import { isOnHiatus, pickNext, selectCandidates } from "@/lib/data/pick-random";

/** Only the fields the candidate filter actually reads. */
function row(
  id: number,
  list_status: string,
  slugs: (string | null)[] = [],
): LibraryRow {
  return {
    id,
    list_status,
    entry_sources: slugs.map((slug) => ({ sources: slug ? { slug } : null })),
  } as unknown as LibraryRow;
}

const ids = (rows: LibraryRow[]) => rows.map((r) => r.id);

const ROWS = [
  row(1, "reading", ["webtoon"]),
  row(2, "reading", []),
  row(3, "completed", ["tapas"]),
  row(4, "dropped", ["webtoon", "tapas"]),
];

describe("selectCandidates", () => {
  it("returns the whole shelf when no chip is active", () => {
    expect(ids(selectCandidates(ROWS, { status: "", source: "" }))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("narrows by status", () => {
    expect(
      ids(selectCandidates(ROWS, { status: "reading", source: "" })),
    ).toEqual([1, 2]);
  });

  it("narrows by source slug", () => {
    expect(
      ids(selectCandidates(ROWS, { status: "", source: "webtoon" })),
    ).toEqual([1, 4]);
  });

  // "none" is its own sentinel, not a slug: it means the row has no source at
  // all, which is the case the user most often wants to go fix.
  it("treats the `none` source as rows with no sources", () => {
    expect(ids(selectCandidates(ROWS, { status: "", source: "none" }))).toEqual(
      [2],
    );
  });

  it("applies status and source together", () => {
    expect(
      ids(selectCandidates(ROWS, { status: "reading", source: "webtoon" })),
    ).toEqual([1]);
  });

  it("returns nothing when the chips agree on nothing", () => {
    expect(
      ids(selectCandidates(ROWS, { status: "completed", source: "webtoon" })),
    ).toEqual([]);
  });
});

describe("pickNext", () => {
  it("returns null when there is nothing to pick from", () => {
    expect(pickNext([], new Set()).entry).toBeNull();
  });

  it("picks the only candidate there is", () => {
    expect(pickNext([ROWS[0]], new Set()).entry?.id).toBe(1);
  });

  // The point of the never-repeat rule: rolling as many times as there are
  // candidates must hand back every one of them, never a duplicate.
  it("never repeats until every candidate has been seen", () => {
    const seen = new Set<number>();

    for (let i = 0; i < ROWS.length; i++) {
      const { entry } = pickNext(ROWS, seen);
      expect(entry).not.toBeNull();
      expect(seen.has(entry!.id)).toBe(false);
      seen.add(entry!.id);
    }

    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  // Exhausted is not stuck: the next roll starts the cycle over rather than
  // returning null on a shelf that plainly has titles on it.
  it("starts over once every candidate has been seen", () => {
    const seen = new Set([1, 2, 3, 4]);
    const { entry } = pickNext(ROWS, seen);

    expect(entry).not.toBeNull();
    expect([1, 2, 3, 4]).toContain(entry!.id);
  });

  // A `seen` carried over from a wider filter must not starve a narrower one:
  // ids that are not candidates any more are simply irrelevant.
  it("ignores seen ids that are not among the candidates", () => {
    const candidates = [ROWS[0], ROWS[1]];
    const { entry } = pickNext(candidates, new Set([3, 4]));

    expect([1, 2]).toContain(entry!.id);
  });

  it("does not mutate the seen set it is given", () => {
    const seen = new Set([1]);
    pickNext(ROWS, seen);
    expect([...seen]).toEqual([1]);
  });
});

// The reset has to be visible to the caller. If it only ever hands back a row,
// the caller keeps growing a `seen` that is already full, every later roll
// finds nothing unseen, and the never-repeat guarantee quietly decays into a
// uniform draw after the first cycle.
describe("pickNext reset signalling", () => {
  it("reports that it did not reset while candidates remain", () => {
    expect(pickNext(ROWS, new Set([1, 2])).reset).toBe(false);
  });

  it("reports the reset when every candidate has been seen", () => {
    expect(pickNext(ROWS, new Set([1, 2, 3, 4])).reset).toBe(true);
  });

  // Following the signal keeps every cycle repeat-free, not just the first.
  it("stays repeat-free across a second cycle when the caller obeys the reset", () => {
    let seen = new Set<number>();
    const cycles: number[][] = [];

    for (let cycle = 0; cycle < 2; cycle++) {
      const drawn: number[] = [];

      for (let i = 0; i < ROWS.length; i++) {
        const { entry, reset } = pickNext(ROWS, seen);
        if (reset) seen = new Set();

        expect(seen.has(entry!.id)).toBe(false);
        seen.add(entry!.id);
        drawn.push(entry!.id);
      }

      cycles.push(drawn.sort());
    }

    expect(cycles[0]).toEqual([1, 2, 3, 4]);
    expect(cycles[1]).toEqual([1, 2, 3, 4]);
  });
});

/**
 * A row whose sources carry hiatus flags, one boolean per attached source.
 * Separate from `row` above, which predates the flag and leaves it undefined.
 */
function hiatusRow(id: number, flags: boolean[]): LibraryRow {
  return {
    id,
    list_status: "reading",
    entry_sources: flags.map((is_hiatus, i) => ({
      is_hiatus,
      sources: { slug: `s${i}` },
    })),
  } as unknown as LibraryRow;
}

describe("isOnHiatus", () => {
  it("is true when every source has paused", () => {
    expect(isOnHiatus(hiatusRow(1, [true, true]))).toBe(true);
  });

  it("is false when any source is still updating", () => {
    // The point of the per-source flag: one site pausing is not the title
    // pausing, so this must not badge or hide.
    expect(isOnHiatus(hiatusRow(1, [true, false]))).toBe(false);
  });

  it("is false for a title with no sources", () => {
    // [].every() is true, so this guards the empty case explicitly — an entry
    // with nowhere recorded is a "No source" card, not a paused one.
    expect(isOnHiatus(hiatusRow(1, []))).toBe(false);
  });
});

describe("selectCandidates — hiatus", () => {
  const SHELF = [
    hiatusRow(1, [true]),
    hiatusRow(2, [false]),
    hiatusRow(3, [true, false]),
    hiatusRow(4, []),
  ];

  it("keeps hiatus titles when the toggle is off", () => {
    expect(ids(selectCandidates(SHELF, { status: "", source: "" }))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("defaults to showing them when hideHiatus is not passed at all", () => {
    // Off-by-default is the contract the page and the provider both rely on.
    const filters = { status: "", source: "" };
    expect(ids(selectCandidates(SHELF, filters))).toHaveLength(4);
  });

  it("drops only fully-paused titles when the toggle is on", () => {
    expect(
      ids(selectCandidates(SHELF, { status: "", source: "", hideHiatus: true })),
    ).toEqual([2, 3, 4]);
  });

  it("combines with a source chip rather than replacing it", () => {
    // "on s0, and not fully paused" — both narrowings apply.
    expect(
      ids(
        selectCandidates(SHELF, {
          status: "",
          source: "s0",
          hideHiatus: true,
        }),
      ),
    ).toEqual([2, 3]);
  });
});
