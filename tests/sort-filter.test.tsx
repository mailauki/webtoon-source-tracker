import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above every const, so the spy has to be hoisted with it.
const { saveLibraryPrefs } = vi.hoisted(() => ({
  saveLibraryPrefs: vi.fn(async () => {}),
}));
vi.mock("@/app/actions/library-prefs", () => ({ saveLibraryPrefs }));

// The grid reads `?q=` to decide whether a search is active.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/entry-card", () => ({
  EntryCard: ({ entry }: { entry: { id: number } }) => (
    <div data-testid="entry">{entry.id}</div>
  ),
}));

import { LibraryFilters, LibraryGrid } from "@/components/library-grid";
import { SortFilter } from "@/components/sort-filter";
import { DEFAULT_SORT, type Sort } from "@/lib/data/library-prefs";
import type { LibraryRow } from "@/lib/data/entries";

function row(id: number, title: string, added: string): LibraryRow {
  return {
    id,
    num_chapters_read: 0,
    created_at: added,
    mal_updated_at: null,
    media_titles: { title, num_chapters: null },
  } as unknown as LibraryRow;
}

const ROWS = [
  row(1, "Beta", "2026-01-01T00:00:00Z"),
  row(2, "Alpha", "2026-03-01T00:00:00Z"),
  row(3, "Gamma", "2026-02-01T00:00:00Z"),
];

function setup(sort: Sort = DEFAULT_SORT) {
  return render(
    <LibraryFilters initial={{ status: "", source: "", sort }}>
      <SortFilter />
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

/** Opens the sort menu and returns once its items are on screen. */
async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: /^Sort by/ }));
}

// Vitest does not enable RTL's auto-cleanup.
afterEach(cleanup);
beforeEach(() => saveLibraryPrefs.mockClear());

describe("the sort menu", () => {
  it("names the current order on the trigger", () => {
    setup({ key: "added", direction: "asc" });
    // A grid of covers gives no other clue as to how it is ordered.
    expect(
      screen.getByRole("button", { name: "Sort by Date added, Oldest first" }),
    ).toBeInTheDocument();
  });

  it("reorders the grid when a key is chosen", async () => {
    setup();
    await openMenu();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Title" }));

    // Title, descending: Gamma, Beta, Alpha.
    expect(visibleIds()).toEqual([3, 1, 2]);
  });

  it("reorders the grid when the direction is flipped", async () => {
    setup({ key: "added", direction: "desc" });
    expect(visibleIds()).toEqual([2, 3, 1]);

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /Oldest first/ }),
    );
    expect(visibleIds()).toEqual([1, 3, 2]);
  });

  // Switching from newest-updated to newest-added is one decision; resetting
  // the direction would silently undo the other half of it.
  it("keeps the chosen direction when the key changes", async () => {
    setup({ key: "updated", direction: "asc" });
    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Date added" }),
    );

    expect(saveLibraryPrefs).toHaveBeenCalledWith({ sort: "added:asc" });
    expect(visibleIds()).toEqual([1, 3, 2]);
  });

  it("labels the direction in the active key's own terms", async () => {
    setup({ key: "title", direction: "asc" });
    await openMenu();
    // "Ascending" would leave the user to work out which end of a date it is.
    expect(
      screen.getByRole("menuitemradio", { name: /A–Z first/ }),
    ).toBeInTheDocument();
  });

  it("persists the choice", async () => {
    setup();
    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Progress" }),
    );
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ sort: "progress:desc" });
  });
});
