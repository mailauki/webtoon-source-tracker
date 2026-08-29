import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above every const, so the spy has to be hoisted with it.
const { saveLibraryPrefs } = vi.hoisted(() => ({
  saveLibraryPrefs: vi.fn(async () => {}),
}));
vi.mock("@/app/actions/library-prefs", () => ({ saveLibraryPrefs }));

// The query is client state and the URL is out of it entirely — nothing here
// reads or writes `?q=`. next/navigation is still mocked because the tree
// pulls it in; nothing under test calls it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

// EntryCard pulls in next/image and Link, neither of which is under test here.
vi.mock("@/components/entry-card", () => ({
  EntryCard: ({ entry }: { entry: { id: number } }) => (
    <div data-testid="entry">{entry.id}</div>
  ),
}));

import { HeaderSearch } from "@/components/header-search";
import { HiatusFilter } from "@/components/hiatus-filter";
import { LibraryFilters, LibraryGrid } from "@/components/library-grid";
import { SourceFilter } from "@/components/source-filter";
import { StatusFilter } from "@/components/status-filter";
import { DEFAULT_SORT } from "@/lib/data/library-prefs";
import type { LibraryRow } from "@/lib/data/entries";

/** Only the fields the filters actually read. */
function row(
  id: number,
  list_status: string,
  slugs: (string | null)[] = [],
  title = `Title ${id}`,
  title_en: string | null = null,
  /** Per-source hiatus flags, positional. Defaults to none paused. */
  hiatus: boolean[] = [],
): LibraryRow {
  return {
    id,
    list_status,
    media_titles: { title, title_en },
    entry_sources: slugs.map((slug, i) => ({
      is_hiatus: hiatus[i] ?? false,
      sources: slug ? { slug } : null,
    })),
  } as unknown as LibraryRow;
}

// Every row's title contains "title", so a search for it matches the whole
// shelf — which is what the "search overrides the chips" tests assert on.
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
    <LibraryFilters initial={{ sort: DEFAULT_SORT, ...initial }}>
      <HeaderSearch />
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
 * Puts the grid in the searching state by typing, which is now the only way
 * in — the query has no seed, so it cannot be handed to the provider.
 */
async function search(q: string) {
  await userEvent.click(screen.getByRole("button", { name: "Search titles" }));
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Search titles" }),
    q,
  );
}

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
  it("shows a match the active chips would otherwise hide", async () => {
    setup({ status: "completed", source: "" });
    await search("title");
    // Without the override this would be [3] — only the completed row.
    expect(visibleIds()).toEqual([1, 2, 3, 4]);
  });

  it("ignores the source chip too", async () => {
    setup({ status: "", source: "webtoon" });
    await search("title");
    expect(visibleIds()).toEqual([1, 2, 3, 4]);
  });

  it("still applies the chips once the search is cleared", async () => {
    setup({ status: "completed", source: "" });
    await search("title");
    expect(visibleIds()).toEqual([1, 2, 3, 4]);

    await userEvent.clear(
      screen.getByRole("searchbox", { name: "Search titles" }),
    );
    expect(visibleIds()).toEqual([3]);
  });

  it("treats a whitespace-only query as no search", async () => {
    setup({ status: "completed", source: "" });
    await search("   ");
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
  it("uses the unfiltered empty state during a search", async () => {
    render(
      <LibraryFilters
        initial={{ status: "completed", source: "webtoon", sort: DEFAULT_SORT }}
      >
        <HeaderSearch />
        <StatusFilter statuses={STATUSES} />
        <SourceFilter sources={SOURCES} />
        <LibraryGrid
          entries={[]}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );
    await search("nonesuch");

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

describe("hide hiatus toggle", () => {
  // 5 is paused everywhere; 6 is paused on one of two sites and so is still
  // readable. Appended to the shared shelf so the existing rows keep their ids.
  const SHELF = [
    ...ROWS,
    row(5, "reading", ["webtoon"], "Title 5", null, [true]),
    row(6, "reading", ["webtoon", "tapas"], "Title 6", null, [true, false]),
  ];

  function setupShelf(initial = { status: "", source: "" }) {
    return render(
      <LibraryFilters initial={{ sort: DEFAULT_SORT, ...initial }}>
        <HiatusFilter />
        <SourceFilter sources={SOURCES} />
        <LibraryGrid
          entries={SHELF}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );
  }

  const toggle = () => screen.getByRole("button", { name: /Hide hiatus/ });

  it("shows hiatus titles by default", () => {
    setupShelf();
    expect(visibleIds()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("hides only fully-paused titles when pressed", async () => {
    setupShelf();
    await userEvent.click(toggle());

    // 5 goes; 6 stays, because it still updates on Tapas.
    expect(visibleIds()).toEqual([1, 2, 3, 4, 6]);
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("brings them back when pressed again", async () => {
    setupShelf();
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(visibleIds()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("persists the choice as a boolean, not a sentinel", async () => {
    setupShelf();
    await userEvent.click(toggle());
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ hideHiatus: true });

    await userEvent.click(toggle());
    // false must survive as false — it is "show them again", not an empty
    // value to be normalised to the `all` sentinel.
    expect(saveLibraryPrefs).toHaveBeenLastCalledWith({ hideHiatus: false });
  });

  it("starts pressed when the stored preference says so", () => {
    render(
      <LibraryFilters
        initial={{ status: "", source: "", hideHiatus: true, sort: DEFAULT_SORT }}
      >
        <HiatusFilter />
        <SourceFilter sources={SOURCES} />
        <LibraryGrid
          entries={SHELF}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );

    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds()).toEqual([1, 2, 3, 4, 6]);
  });

  it("narrows alongside a source chip rather than replacing it", async () => {
    setupShelf({ status: "", source: "tapas" });
    await userEvent.click(toggle());
    // On Tapas: 3, 4 and 6 — none of which is paused everywhere.
    expect(visibleIds()).toEqual([3, 4, 6]);
  });

  it("shows the filtered empty state when it hides the last title", async () => {
    render(
      <LibraryFilters initial={{ status: "", source: "", sort: DEFAULT_SORT }}>
        <HiatusFilter />
        <SourceFilter sources={SOURCES} />
        <LibraryGrid
          entries={[row(9, "reading", ["webtoon"], "Title 9", null, [true])]}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );

    await userEvent.click(toggle());
    // "your filters hid it", not "nothing synced yet" — the shelf is not empty.
    expect(screen.getByText("No titles match")).toBeInTheDocument();
  });
});
