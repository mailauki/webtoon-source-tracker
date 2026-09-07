import { describe, expect, it } from "vitest";

import type { LibraryRow } from "@/lib/data/entries";
import {
  isOnHiatus,
  pickNext,
  selectByMode,
  selectCandidates,
} from "@/lib/data/pick-random";

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

/**
 * A row with a last-touched timestamp, for the neglected mode. Days are
 * relative to NOW so the fixtures read as "touched N days ago".
 */
const NOW = new Date("2026-03-01T00:00:00Z").getTime();

function agedRow(
  id: number,
  list_status: string,
  daysAgo: number | null,
  flags: boolean[] = [false],
): LibraryRow {
  return {
    id,
    list_status,
    mal_updated_at:
      daysAgo === null
        ? null
        : new Date(NOW - daysAgo * 86_400_000).toISOString(),
    entry_sources: flags.map((is_hiatus, i) => ({
      is_hiatus,
      sources: { slug: `s${i}` },
    })),
  } as unknown as LibraryRow;
}

const NO_CHIPS = { status: "", source: "" };

describe("selectByMode — surprise", () => {
  it("is the chip selection, unchanged", () => {
    // The plain roll still draws from exactly what the shelf is showing, so
    // it must agree with selectCandidates on every input.
    const filters = { status: "reading", source: "webtoon" };
    expect(ids(selectByMode(ROWS, "surprise", filters))).toEqual(
      ids(selectCandidates(ROWS, filters)),
    );
  });
});

describe("selectByMode — plan", () => {
  const SHELF = [
    agedRow(1, "plan_to_read", 5),
    agedRow(2, "reading", 5),
    agedRow(3, "plan_to_read", 5),
    agedRow(4, "completed", 5),
  ];

  it("keeps only plan-to-read titles", () => {
    expect(ids(selectByMode(SHELF, "plan", NO_CHIPS))).toEqual([1, 3]);
  });

  // The mode is a shortcut past the chips, not a narrowing of them: asking
  // for something from the pile you have not started must not come back empty
  // because the Reading chip happens to be active.
  it("ignores the active chips", () => {
    const filters = { status: "reading", source: "nowhere" };
    expect(ids(selectByMode(SHELF, "plan", filters))).toEqual([1, 3]);
  });

  it("still honours the hiatus toggle", () => {
    // Hiding paused titles is the user saying they are bad recommendations,
    // which is true in every mode.
    const shelf = [
      agedRow(1, "plan_to_read", 5, [true]),
      agedRow(2, "plan_to_read", 5, [false]),
    ];
    expect(
      ids(selectByMode(shelf, "plan", { ...NO_CHIPS, hideHiatus: true })),
    ).toEqual([2]);
  });
});

describe("selectByMode — neglected", () => {
  it("keeps only titles that were started and parked", () => {
    // Completed and dropped are settled; nudging the user back to them is not
    // what this button is for.
    const shelf = [
      agedRow(1, "reading", 100),
      agedRow(2, "on_hold", 100),
      agedRow(3, "completed", 100),
      agedRow(4, "dropped", 100),
      agedRow(5, "plan_to_read", 100),
    ];
    expect(ids(selectByMode(shelf, "neglected", NO_CHIPS))).toEqual([
      1, 2,
    ]);
  });

  it("ignores the active chips", () => {
    const shelf = [agedRow(1, "reading", 100), agedRow(2, "on_hold", 100)];
    const filters = { status: "completed", source: "nowhere" };
    expect(ids(selectByMode(shelf, "neglected", filters))).toEqual([1, 2]);
  });

  // The slice is what makes this "in a while" rather than "anything you are
  // reading": on a long shelf only the stalest third is eligible.
  it("keeps the oldest third of a long shelf", () => {
    const shelf = Array.from({ length: 30 }, (_, i) =>
      agedRow(i + 1, "reading", i + 1),
    );
    const picked = ids(selectByMode(shelf, "neglected", NO_CHIPS));

    expect(picked).toHaveLength(10);
    // Highest daysAgo is the least recently touched, and ids ascend with it.
    expect(picked.sort((a, b) => a - b)).toEqual([
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ]);
  });

  // A third of a small shelf is one or two titles, which is not a draw. The
  // floor keeps the button useful for someone with a short list.
  it("keeps at least five candidates on a short shelf", () => {
    const shelf = Array.from({ length: 9 }, (_, i) =>
      agedRow(i + 1, "reading", i + 1),
    );
    expect(selectByMode(shelf, "neglected", NO_CHIPS)).toHaveLength(5);
  });

  it("keeps everything when there is less than the floor", () => {
    const shelf = [agedRow(1, "reading", 1), agedRow(2, "reading", 2)];
    expect(ids(selectByMode(shelf, "neglected", NO_CHIPS))).toEqual([
      2, 1,
    ]);
  });

  // Never logged at all is the most neglected a title can be, so a null sorts
  // as older than any real timestamp rather than falling to the bottom.
  it("treats a title never logged as the most neglected", () => {
    const shelf = [
      agedRow(1, "reading", 1),
      agedRow(2, "reading", 2),
      agedRow(3, "reading", null),
    ];
    expect(ids(selectByMode(shelf, "neglected", NO_CHIPS))[0]).toBe(3);
  });

  it("still honours the hiatus toggle", () => {
    const shelf = [
      agedRow(1, "reading", 100, [true]),
      agedRow(2, "reading", 90, [false]),
    ];
    expect(
      ids(
        selectByMode(shelf, "neglected", { ...NO_CHIPS, hideHiatus: true }),
      ),
    ).toEqual([2]);
  });

  it("returns nothing when no title is in progress", () => {
    const shelf = [agedRow(1, "completed", 100), agedRow(2, "plan_to_read", 3)];
    expect(selectByMode(shelf, "neglected", NO_CHIPS)).toEqual([]);
  });
});
