import { describe, expect, it } from "vitest";

import type { LibraryRow } from "@/lib/data/entries";
import {
  isOnHiatus,
  isOwned,
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
 * A row whose sources carry owned flags, one boolean per attached source.
 * Separate from `hiatusRow` so a fixture can vary one flag without implying
 * anything about the other.
 */
function ownedRow(id: number, flags: boolean[]): LibraryRow {
  return {
    id,
    list_status: "reading",
    entry_sources: flags.map((is_owned, i) => ({
      is_owned,
      sources: { slug: `s${i}` },
    })),
  } as unknown as LibraryRow;
}

describe("isOwned", () => {
  it("is true when the only source is owned", () => {
    expect(isOwned(ownedRow(1, [true]))).toBe(true);
  });

  // The asymmetry with isOnHiatus, which is the whole design: hiatus needs
  // every copy to have stopped, ownership needs only one to have been bought.
  it("is true when any source is owned", () => {
    expect(isOwned(ownedRow(1, [false, true]))).toBe(true);
  });

  // Recording a second place you read something must not un-own the title.
  it("stays true when an unowned source is added alongside an owned one", () => {
    expect(isOwned(ownedRow(1, [true]))).toBe(true);
    expect(isOwned(ownedRow(1, [true, false, false]))).toBe(true);
  });

  it("is false when no source is owned", () => {
    expect(isOwned(ownedRow(1, [false, false]))).toBe(false);
  });

  it("is false for a title with no sources", () => {
    // Ownership is recorded on a source, so a title with none cannot be owned
    // — and unlike isOnHiatus this needs no explicit guard, since
    // [].some() is already false. Asserted so a refactor cannot flip it.
    expect(isOwned(ownedRow(1, []))).toBe(false);
  });

  // `is_owned` is the flag; `chapters_owned` is only how much. Someone who
  // ticked the box without counting has still said yes.
  it("does not depend on a chapter count", () => {
    const uncounted = {
      id: 1,
      list_status: "reading",
      entry_sources: [
        { is_owned: true, chapters_owned: null, sources: { slug: "s0" } },
      ],
    } as unknown as LibraryRow;

    expect(isOwned(uncounted)).toBe(true);
  });
});

describe("selectCandidates — owned", () => {
  const SHELF = [
    ownedRow(1, [true]),
    ownedRow(2, [false]),
    ownedRow(3, [false, true]),
    ownedRow(4, []),
  ];

  it("keeps everything when the toggle is off", () => {
    expect(ids(selectCandidates(SHELF, { status: "", source: "" }))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("defaults to showing everything when ownedOnly is not passed at all", () => {
    // Off-by-default is the contract the page and the provider both rely on —
    // and it matters more here than for hiatus, since a shelf with nothing
    // marked owned would otherwise come back empty.
    const filters = { status: "", source: "" };
    expect(ids(selectCandidates(SHELF, filters))).toHaveLength(4);
  });

  it("keeps only owned titles when the toggle is on", () => {
    expect(
      ids(selectCandidates(SHELF, { status: "", source: "", ownedOnly: true })),
    ).toEqual([1, 3]);
  });

  it("drops titles with no sources, which cannot be owned", () => {
    expect(
      ids(
        selectCandidates([ownedRow(4, [])], {
          status: "",
          source: "",
          ownedOnly: true,
        }),
      ),
    ).toEqual([]);
  });

  it("combines with a source chip rather than replacing it", () => {
    // "on s1, and owned somewhere" — both narrowings apply. Note the owned
    // copy does not have to be the chipped source: 3 is owned on s1 and shown
    // because it is on s1, but it would show for an s0 chip too.
    expect(
      ids(
        selectCandidates(SHELF, { status: "", source: "s1", ownedOnly: true }),
      ),
    ).toEqual([3]);
  });

  it("combines with the hiatus toggle", () => {
    // Owned and paused everywhere is an ordinary state — a series you bought
    // that has since stopped — so the two toggles have to intersect rather
    // than one winning.
    const shelf = [
      {
        id: 1,
        list_status: "reading",
        entry_sources: [
          { is_owned: true, is_hiatus: true, sources: { slug: "s0" } },
        ],
      },
      {
        id: 2,
        list_status: "reading",
        entry_sources: [
          { is_owned: true, is_hiatus: false, sources: { slug: "s0" } },
        ],
      },
      {
        id: 3,
        list_status: "reading",
        entry_sources: [
          { is_owned: false, is_hiatus: false, sources: { slug: "s0" } },
        ],
      },
    ] as unknown as LibraryRow[];

    expect(
      ids(
        selectCandidates(shelf, {
          status: "",
          source: "",
          ownedOnly: true,
          hideHiatus: true,
        }),
      ),
    ).toEqual([2]);
  });

  it("applies status and ownership together", () => {
    const shelf = [
      ownedRow(1, [true]),
      { ...ownedRow(2, [true]), list_status: "completed" } as LibraryRow,
    ];
    expect(
      ids(
        selectCandidates(shelf, {
          status: "reading",
          source: "",
          ownedOnly: true,
        }),
      ),
    ).toEqual([1]);
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

/** An aged row whose single source carries an owned flag. */
function agedOwnedRow(
  id: number,
  list_status: string,
  daysAgo: number | null,
  owned: boolean,
): LibraryRow {
  return {
    id,
    list_status,
    mal_updated_at:
      daysAgo === null
        ? null
        : new Date(NOW - daysAgo * 86_400_000).toISOString(),
    entry_sources: [{ is_owned: owned, is_hiatus: false, sources: { slug: "s0" } }],
  } as unknown as LibraryRow;
}

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

  it("still honours the owned toggle", () => {
    // Same reasoning read the other way: someone looking only at what they
    // have bought does not want to be handed something they would have to buy
    // first, whichever button they pressed.
    const shelf = [
      agedOwnedRow(1, "plan_to_read", 5, false),
      agedOwnedRow(2, "plan_to_read", 5, true),
    ];
    expect(
      ids(selectByMode(shelf, "plan", { ...NO_CHIPS, ownedOnly: true })),
    ).toEqual([2]);
  });

  // The modes reach past the *chips*, not past the toggles — the chips are a
  // view of the shelf, while the toggles rule titles out as recommendations.
  it("honours the toggles even while ignoring the chips", () => {
    const shelf = [
      agedOwnedRow(1, "plan_to_read", 5, false),
      agedOwnedRow(2, "plan_to_read", 5, true),
    ];
    expect(
      ids(
        selectByMode(shelf, "plan", {
          status: "reading",
          source: "nowhere",
          ownedOnly: true,
        }),
      ),
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

  it("still honours the owned toggle", () => {
    const shelf = [
      agedOwnedRow(1, "reading", 100, false),
      agedOwnedRow(2, "reading", 90, true),
    ];
    expect(
      ids(selectByMode(shelf, "neglected", { ...NO_CHIPS, ownedOnly: true })),
    ).toEqual([2]);
  });

  // The gate runs before the slice, so the stalest third is a third of what
  // survives the toggles — not a third of the shelf, most of which the toggle
  // would then throw away.
  it("takes the slice from what the toggle leaves, not the whole shelf", () => {
    const shelf = [
      ...Array.from({ length: 30 }, (_, i) =>
        agedOwnedRow(i + 1, "reading", i + 1, false),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        agedOwnedRow(i + 101, "reading", i + 1, true),
      ),
    ];
    const picked = ids(
      selectByMode(shelf, "neglected", { ...NO_CHIPS, ownedOnly: true }),
    );

    // A third of the 30 owned rows, not a third of all 60.
    expect(picked).toHaveLength(10);
    expect(picked.every((id) => id > 100)).toBe(true);
  });

  it("returns nothing when no title is in progress", () => {
    const shelf = [agedRow(1, "completed", 100), agedRow(2, "plan_to_read", 3)];
    expect(selectByMode(shelf, "neglected", NO_CHIPS)).toEqual([]);
  });
});

describe("selectCandidates, hideNsfw", () => {
  // Only ever true for a viewer who may see adult titles at all — an account
  // under the age floor never receives these rows, so this is the viewer's
  // own preference rather than the gate.

  const rated = (id: number, nsfw: string | null): LibraryRow =>
    ({
      id,
      list_status: "reading",
      entry_sources: [],
      media_titles: { nsfw },
    }) as unknown as LibraryRow;

  const MIXED = [
    rated(1, "white"),
    rated(2, "gray"),
    rated(3, null),
    rated(4, "black"),
  ];

  it("keeps everything when off", () => {
    expect(ids(selectCandidates(MIXED, { status: "", source: "" }))).toEqual([1, 2, 3, 4]);
  });

  it("drops gray and black when on", () => {
    expect(ids(selectCandidates(MIXED, { status: "", source: "", hideNsfw: true }))).toEqual([1, 3]);
  });

  it("keeps an unrated title, rather than guessing it is adult", () => {
    // Null is "never fetched". Treating it as adult would empty a shelf the
    // rating backfill had not reached yet.
    expect(ids(selectCandidates([rated(9, null)], {
        status: "",
        source: "",
        hideNsfw: true,
      }))).toEqual(
      [9],
    );
  });

  it("combines with the other filters rather than replacing them", () => {
    const rows = [
      { ...rated(1, "white"), list_status: "reading" },
      { ...rated(2, "gray"), list_status: "reading" },
      { ...rated(3, "white"), list_status: "completed" },
    ] as LibraryRow[];

    expect(
      ids(selectCandidates(rows, { status: "reading", source: "", hideNsfw: true })),
    ).toEqual([1]);
  });
});
