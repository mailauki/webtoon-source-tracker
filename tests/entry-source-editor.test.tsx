import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The editor imports the server actions its forms submit; none is called here.
vi.mock("@/app/actions/entry-sources", () => ({
  addEntrySource: vi.fn(async () => ({ message: "Source added." })),
  updateEntrySource: vi.fn(async () => ({ message: "Source updated." })),
  removeEntrySource: vi.fn(async () => ({ message: "Source removed." })),
}));
vi.mock("@/app/actions/custom-sources", () => ({
  createCustomSource: vi.fn(async () => ({ message: "Source created." })),
}));

import { EntrySourceEditor } from "@/components/entry-source-editor";
import type { EntrySource } from "@/components/source-fields";
import type { ChapterTotal } from "@/lib/data/chapter-totals";

function source(overrides: Partial<EntrySource> = {}): EntrySource {
  return {
    id: overrides.id ?? 55,
    url: null,
    chapters_read: null,
    notes: null,
    is_primary: false,
    is_official: true,
    is_paid: false,
    is_hiatus: false,
    is_owned: false,
    chapters_owned: null as string | null,
    sources: { id: 1, name: "Tapas" },
    ...overrides,
  };
}

function setup(sources: EntrySource[], total: ChapterTotal | null = null) {
  render(
    <EntrySourceEditor
      entryId={7}
      sources={sources}
      catalog={[]}
      total={total}
    />,
  );
}

afterEach(cleanup);

/**
 * What the attached-source row says about ownership.
 *
 * The count survives an unticking of Owned so a hand-entered number is not
 * lost (see SourceFields), which means a row can carry a count while its flag
 * is off. This row is what would otherwise report that as owned.
 */
describe("the owned line on an attached source", () => {
  it("reports a count on a source marked owned", () => {
    setup([source({ is_owned: true, chapters_owned: "{[1,41)}" })]);
    expect(screen.getByText("40 chapters owned here")).toBeInTheDocument();
  });

  it("counts against MAL's total when there is one", () => {
    setup([source({ is_owned: true, chapters_owned: "{[1,41)}" })], {
      count: 179,
      final: true,
    });
    expect(
      screen.getByText("40 of 179 chapters owned here"),
    ).toBeInTheDocument();
  });

  it("says so plainly when a finished series is owned outright", () => {
    setup([source({ is_owned: true, chapters_owned: "{[1,180)}" })], {
      count: 179,
      final: true,
    });
    expect(screen.getByText("All 179 chapters owned here")).toBeInTheDocument();
  });

  // The contradiction this gate exists to prevent: a remembered count on a
  // source the user has un-marked must not be spoken about as owned.
  it("stays silent about a count left behind on an unowned source", () => {
    setup([source({ is_owned: false, chapters_owned: "{[1,41)}" })]);

    expect(screen.queryByText(/chapters owned here/)).not.toBeInTheDocument();
    expect(screen.queryByText("Owned")).not.toBeInTheDocument();
  });

  // "Owned, not counted" is a real answer — the flag alone is enough, and a
  // null count must not print as zero.
  it("marks an owned source that carries no count, without inventing one", () => {
    setup([source({ is_owned: true, chapters_owned: null })]);

    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.queryByText(/chapters owned here/)).not.toBeInTheDocument();
  });

  it("leaves an unowned source unmarked", () => {
    setup([source()]);
    expect(screen.queryByText("Owned")).not.toBeInTheDocument();
  });
});

/** A second source, so the union has something to union. */
function other(overrides: Partial<EntrySource> = {}): EntrySource {
  return source({
    id: 56,
    sources: { id: 2, name: "Webtoon" },
    ...overrides,
  });
}

describe("what one source contributes", () => {
  it("names the ranges when ownership is scattered", () => {
    setup([source({ is_owned: true, chapters_owned: "{[1,41),[55,56)}" })]);

    expect(screen.getByText("41 chapters owned here")).toBeInTheDocument();
    expect(screen.getByText("1–40, 55")).toBeInTheDocument();
  });

  // One run needs no second line: the count above already says it.
  it("does not repeat a single contiguous run", () => {
    setup([source({ is_owned: true, chapters_owned: "{[1,41)}" })]);

    expect(screen.getByText("40 chapters owned here")).toBeInTheDocument();
    expect(screen.queryByText("1–40")).not.toBeInTheDocument();
  });
});

/**
 * The cross-source union.
 *
 * The question a per-source count cannot answer, because sources overlap and
 * their counts cannot be added.
 */
describe("owned across sources", () => {
  const summary = () => screen.queryByText(/chapters owned in total/);

  // The motivating case, end to end: 1–40 on one, 30–40 plus three loose
  // chapters on the other. Adding the counts would claim 54.
  it("counts an overlap between two sources only once", () => {
    setup(
      [
        source({ is_owned: true, chapters_owned: "{[1,41)}" }),
        other({
          is_owned: true,
          chapters_owned: "{[30,41),[55,56),[60,61),[70,71)}",
        }),
      ],
      { count: 179, final: true },
    );

    expect(
      screen.getByText("43 of 179 chapters owned in total"),
    ).toBeInTheDocument();
    expect(screen.getByText("1–40, 55, 60, 70")).toBeInTheDocument();
  });

  it("names the holes inside what is owned", () => {
    setup([
      source({ is_owned: true, chapters_owned: "{[1,41)}" }),
      other({ is_owned: true, chapters_owned: "{[55,61)}" }),
    ]);

    expect(screen.getByText("Missing 41–54")).toBeInTheDocument();
  });

  it("joins two sources that between them cover a run", () => {
    setup([
      source({ is_owned: true, chapters_owned: "{[1,41)}" }),
      other({ is_owned: true, chapters_owned: "{[41,55)}" }),
    ]);

    expect(screen.getByText("54 chapters owned in total")).toBeInTheDocument();
    expect(screen.queryByText(/Missing/)).not.toBeInTheDocument();
  });

  // With one source the row above already is the answer, and a heading
  // promising a synthesis over a single input is worse than saying nothing.
  it("stays quiet until a second source is owned", () => {
    setup([source({ is_owned: true, chapters_owned: "{[1,41)}" })]);
    expect(summary()).not.toBeInTheDocument();
  });

  // Same gate as the per-source row: the form keeps a range through an
  // unticking of Owned, and counting it here would contradict the flag.
  it("ignores a range left behind on an unowned source", () => {
    setup([
      source({ is_owned: true, chapters_owned: "{[1,41)}" }),
      other({ is_owned: false, chapters_owned: "{[55,61)}" }),
    ]);

    // Only one owned source remains, so there is nothing to union.
    expect(summary()).not.toBeInTheDocument();
  });

  it("says nothing when two owned sources carry no ranges at all", () => {
    setup([
      source({ is_owned: true, chapters_owned: null }),
      other({ is_owned: true, chapters_owned: null }),
    ]);
    expect(summary()).not.toBeInTheDocument();
  });
});
