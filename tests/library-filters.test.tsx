import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above every const, so the spy has to be hoisted with it.
const { saveLibraryPrefs } = vi.hoisted(() => ({
  saveLibraryPrefs: vi.fn(async () => {}),
}));
vi.mock("@/app/actions/library-prefs", () => ({ saveLibraryPrefs }));

// The grid reads `?q=` to decide whether a search is active. Backed by a
// mutable value so a test can put the component "in search" without a router.
const { searchParams } = vi.hoisted(() => ({
  searchParams: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.current,
}));

/** Puts the grid in the searching state for the render that follows. */
function withQuery(q: string) {
  searchParams.current = new URLSearchParams(q ? { q } : {});
}

// EntryCard pulls in next/image and Link, neither of which is under test here.
vi.mock("@/components/entry-card", () => ({
  EntryCard: ({ entry }: { entry: { id: number } }) => (
    <div data-testid="entry">{entry.id}</div>
  ),
}));

import { LibraryFilters, LibraryGrid } from "@/components/library-grid";
import { SourceFilter } from "@/components/source-filter";
import { StatusFilter } from "@/components/status-filter";
import type { LibraryRow } from "@/lib/data/entries";

/** Only the fields the filters actually read. */
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

const ROWS = [
  row(1, "reading", ["webtoon"]),
  row(2, "reading", []),
  row(3, "completed", ["tapas"]),
  row(4, "dropped", ["webtoon", "tapas"]),
];

const STATUSES = [
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];
const SOURCES = [
  { value: "webtoon", label: "Webtoon" },
  { value: "tapas", label: "Tapas" },
];

function setup(initial = { status: "", source: "" }) {
  return render(
    <LibraryFilters initial={initial}>
      <StatusFilter statuses={STATUSES} />
      <SourceFilter sources={SOURCES} />
      <LibraryGrid
        entries={ROWS}
        emptyFiltered={<p>No titles match</p>}
        emptyUnfiltered={<p>Nothing synced yet</p>}
      />
    </LibraryFilters>,
  );
}

const visibleIds = () =>
  screen.queryAllByTestId("entry").map((n) => Number(n.textContent));

/**
 * The chip a user would click.
 *
 * Scoped by group because both rows render an "All" chip. The status row also
 * renders its active chip twice — once in the full row, once as the collapsed
 * mobile summary — and jsdom applies no CSS, so both are "visible" here. The
 * first match is the real row; the duplicate is the `sm:hidden` summary.
 */
function chip(group: "status" | "source", label: string) {
  const region = screen.getByRole("group", {
    name: group === "status" ? "Filter by status" : "Filter by source",
  });
  const matches = within(region).getAllByRole("button", {
    name: new RegExp(`^${label}`),
  });
  return matches[0];
}

// Vitest does not enable RTL's auto-cleanup, so renders would otherwise
// accumulate in one document and every query would find duplicates.
afterEach(cleanup);
beforeEach(() => {
  saveLibraryPrefs.mockClear();
  withQuery("");
});

describe("filtering", () => {
  it("shows everything when no filter is set", () => {
    setup();
    expect(visibleIds()).toEqual([1, 2, 3, 4]);
  });

  it("narrows the grid to the chosen status", async () => {
    setup();
    await userEvent.click(chip("status", "Reading"));
    expect(visibleIds()).toEqual([1, 2]);
  });

  it("matches a title on any of its sources, not just the first", async () => {
    setup();
    await userEvent.click(chip("source", "Tapas"));
    // Row 4 lists webtoon first; it must still match on tapas.
    expect(visibleIds()).toEqual([3, 4]);
  });

  it("treats 'No source' as titles with no sources at all", async () => {
    setup();
    await userEvent.click(chip("source", "No source"));
    expect(visibleIds()).toEqual([2]);
  });

  it("combines status and source", async () => {
    setup();
    await userEvent.click(chip("status", "Reading"));
    await userEvent.click(chip("source", "Webtoon"));
    expect(visibleIds()).toEqual([1]);
  });

  it("starts from the stored preference", () => {
    setup({ status: "completed", source: "" });
    expect(visibleIds()).toEqual([3]);
  });
});

/**
 * A search is a lookup of one title, not a view of the shelf, so the chips do
 * not apply to it. If they did, searching for something outside the current
 * filter would report it missing — and the MAL panel below would then offer to
 * add a title the user already owns.
 */
describe("search overrides the chips", () => {
  it("shows a match the active chips would otherwise hide", () => {
    withQuery("solo");
    setup({ status: "completed", source: "" });
    // Without the override this would be [3] — only the completed row.
    expect(visibleIds()).toEqual([1, 2, 3, 4]);
  });

  it("ignores the source chip too", () => {
    withQuery("solo");
    setup({ status: "", source: "webtoon" });
    expect(visibleIds()).toEqual([1, 2, 3, 4]);
  });

  it("still applies the chips once the search is cleared", () => {
    withQuery("");
    setup({ status: "completed", source: "" });
    expect(visibleIds()).toEqual([3]);
  });

  it("treats a whitespace-only query as no search", () => {
    withQuery("   ");
    setup({ status: "completed", source: "" });
    expect(visibleIds()).toEqual([3]);
  });
});

describe("empty states", () => {
  it("distinguishes 'nothing synced' from 'nothing matches'", async () => {
    setup();
    expect(screen.queryByText("Nothing synced yet")).not.toBeInTheDocument();

    await userEvent.click(chip("status", "Completed"));
    await userEvent.click(chip("source", "Webtoon"));

    expect(screen.getByText("No titles match")).toBeInTheDocument();
    expect(screen.queryByText("Nothing synced yet")).not.toBeInTheDocument();
  });

  // While searching, the chips are not applied — so a miss is never "your
  // filters hid it". The page renders the search-specific copy in that slot.
  it("uses the unfiltered empty state during a search", () => {
    withQuery("nonesuch");
    render(
      <LibraryFilters initial={{ status: "completed", source: "webtoon" }}>
        <StatusFilter statuses={STATUSES} />
        <SourceFilter sources={SOURCES} />
        <LibraryGrid
          entries={[]}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );

    expect(screen.getByText("Nothing synced yet")).toBeInTheDocument();
    expect(screen.queryByText("No titles match")).not.toBeInTheDocument();
  });
});

describe("persistence", () => {
  it("saves the selection", async () => {
    setup();
    await userEvent.click(chip("status", "Reading"));
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ status: "reading" });
  });

  // Regression: clicking the active chip clears it, and "" must be stored as
  // the explicit `all` sentinel — null would read as "never chose" and the old
  // filter would come back on the next visit.
  it("stores a cleared filter as the explicit sentinel", async () => {
    setup({ status: "reading", source: "" });
    await userEvent.click(chip("status", "Reading"));
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ status: "all" });
    expect(visibleIds()).toEqual([1, 2, 3, 4]);
  });

  it("saves only the filter that changed", async () => {
    setup({ status: "reading", source: "webtoon" });
    await userEvent.click(chip("source", "Tapas"));
    // A source click must not overwrite the saved status.
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ source: "tapas" });
  });
});
