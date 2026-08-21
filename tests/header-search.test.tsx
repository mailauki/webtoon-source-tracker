import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression cover for search interrupting typing on mobile.
 *
 * The bug: the query lived in `?q=`, and the field carried `key={urlQuery}`.
 * Every debounced keystroke wrote the URL, the key changed, and React
 * unmounted the focused input and mounted a fresh one — which on a phone
 * dismisses the keyboard with the element it was attached to, mid-word.
 *
 * Nothing static catches that. `key` is valid on any element and the remount
 * is correct React; only driving the field through real keystrokes and
 * checking the element survives will show it. That is what these do.
 */

vi.mock("@/app/actions/library-prefs", () => ({
  saveLibraryPrefs: vi.fn(async () => {}),
}));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/components/entry-card", () => ({
  EntryCard: ({ entry }: { entry: { id: number } }) => (
    <div data-testid="entry">{entry.id}</div>
  ),
}));

import { HeaderSearch } from "@/components/header-search";
import { LibraryFilters, LibraryGrid } from "@/components/library-grid";
import { DEFAULT_SORT } from "@/lib/data/library-prefs";
import type { LibraryRow } from "@/lib/data/entries";

function row(id: number, title: string, title_en: string | null = null) {
  return {
    id,
    list_status: "reading",
    media_titles: { title, title_en },
    entry_sources: [],
  } as unknown as LibraryRow;
}

const ROWS = [
  row(1, "Solo Leveling"),
  row(2, "Omniscient Reader", "Omniscient Reader's Viewpoint"),
  row(3, "Tower of God"),
];

function setup(initialQuery = "") {
  return render(
    <LibraryFilters
      initial={{ status: "", source: "", sort: DEFAULT_SORT }}
      initialQuery={initialQuery}
    >
      <HeaderSearch />
      <LibraryGrid
        entries={ROWS}
        emptyFiltered={<p>No titles match</p>}
        emptyUnfiltered={<p>Nothing synced yet</p>}
        emptySearch={<p>Not in your library</p>}
      />
    </LibraryFilters>,
  );
}

const visibleIds = () =>
  screen.queryAllByTestId("entry").map((n) => Number(n.textContent));

const field = () => screen.getByRole("searchbox", { name: "Search titles" });

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Search titles" }));
}

afterEach(cleanup);
beforeEach(() => {
  vi.useRealTimers();
  replace.mockClear();
});

describe("typing is never interrupted", () => {
  /**
   * The core assertion. Holding the DOM node across every keystroke is what
   * proves it was never unmounted — the old `key={urlQuery}` shape fails here,
   * because React swaps in a different element as soon as the URL is written.
   */
  it("keeps the same input element across every keystroke", async () => {
    setup();
    await open();

    const element = field();
    await userEvent.type(element, "solo leveling");

    expect(field()).toBe(element);
    expect(element).toHaveValue("solo leveling");
  });

  it("keeps focus on the field while typing", async () => {
    setup();
    await open();
    await userEvent.type(field(), "tower");

    // Focus surviving is what keeps the mobile keyboard up; a remount drops it.
    expect(field()).toHaveFocus();
  });

  it("does not navigate while the user is still typing", async () => {
    setup();
    await open();
    await userEvent.type(field(), "solo");

    // The URL write is debounced well behind the keystrokes. If this fires
    // during typing, the page re-renders under a focused input again.
    expect(replace).not.toHaveBeenCalled();
  });

  it("still reaches the URL once typing settles", async () => {
    setup();
    await open();
    await userEvent.type(field(), "solo");

    // Debounced, not dropped: `?q=` still has to land, or a search would stop
    // being linkable and would not survive a reload.
    await waitFor(
      () =>
        expect(replace).toHaveBeenCalledWith("/library?q=solo", {
          scroll: false,
        }),
      { timeout: 2000 },
    );
    // And exactly once — one settled write, not one per character.
    expect(replace).toHaveBeenCalledTimes(1);
  });
});

describe("filtering", () => {
  it("narrows the grid on the keystroke, with no round-trip", async () => {
    setup();
    await open();
    await userEvent.type(field(), "solo");

    // No timers advanced and no navigation: the grid moved on state alone.
    expect(visibleIds()).toEqual([1]);
    expect(replace).not.toHaveBeenCalled();
  });

  it("matches case-insensitively", async () => {
    setup();
    await open();
    await userEvent.type(field(), "TOWER");
    expect(visibleIds()).toEqual([3]);
  });

  it("matches the English title as well as the romanised one", async () => {
    setup();
    await open();
    // Only row 2's `title_en` contains "viewpoint".
    await userEvent.type(field(), "viewpoint");
    expect(visibleIds()).toEqual([2]);
  });

  it("shows the search empty state when nothing matches", async () => {
    setup();
    await open();
    await userEvent.type(field(), "nonesuch");

    expect(screen.getByText("Not in your library")).toBeInTheDocument();
    expect(screen.queryByText("Nothing synced yet")).not.toBeInTheDocument();
  });

  it("restores the full shelf when the query is cleared", async () => {
    setup();
    await open();
    await userEvent.type(field(), "solo");
    expect(visibleIds()).toEqual([1]);

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(visibleIds()).toEqual([1, 2, 3]);
  });
});

describe("a shared search URL", () => {
  it("opens already expanded, with the term applied", () => {
    setup("tower");

    expect(field()).toHaveValue("tower");
    expect(visibleIds()).toEqual([3]);
  });

  it("does not re-write the URL it just arrived from", async () => {
    vi.useFakeTimers();
    setup("tower");
    // The effect bails when the URL already matches, so a shared link does not
    // immediately navigate to itself.
    await vi.advanceTimersByTimeAsync(1000);
    expect(replace).not.toHaveBeenCalled();
  });
});
