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
    id: 55,
    url: null,
    chapters_read: null,
    notes: null,
    is_primary: false,
    is_official: true,
    is_paid: false,
    is_hiatus: false,
    is_owned: false,
    chapters_owned: null,
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
    setup([source({ is_owned: true, chapters_owned: 40 })]);
    expect(screen.getByText("40 chapters owned here")).toBeInTheDocument();
  });

  it("counts against MAL's total when there is one", () => {
    setup([source({ is_owned: true, chapters_owned: 40 })], {
      count: 179,
      final: true,
    });
    expect(
      screen.getByText("40 of 179 chapters owned here"),
    ).toBeInTheDocument();
  });

  it("says so plainly when a finished series is owned outright", () => {
    setup([source({ is_owned: true, chapters_owned: 179 })], {
      count: 179,
      final: true,
    });
    expect(screen.getByText("All 179 chapters owned here")).toBeInTheDocument();
  });

  // The contradiction this gate exists to prevent: a remembered count on a
  // source the user has un-marked must not be spoken about as owned.
  it("stays silent about a count left behind on an unowned source", () => {
    setup([source({ is_owned: false, chapters_owned: 40 })]);

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
