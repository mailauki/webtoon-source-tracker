import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above every const, so the spy has to be hoisted with it.
const { saveLibraryPrefs } = vi.hoisted(() => ({
  saveLibraryPrefs: vi.fn(async () => {}),
}));
vi.mock("@/app/actions/library-prefs", () => ({ saveLibraryPrefs }));

// next/navigation is mocked because the tree pulls it in; nothing under test
// calls it. The chips do not navigate — the selection is stored per user, so
// there is no URL for them to write.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

// EntryCard pulls in next/image and Link, neither of which is under test here.
vi.mock("@/components/entry-card", () => ({
  EntryCard: ({ entry }: { entry: { id: number } }) => (
    <div data-testid="entry">{entry.id}</div>
  ),
}));

import { LibraryFilterMenu } from "@/components/library-filter-menu";
import { LibraryFilters, LibraryGrid } from "@/components/library-grid";
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
  /** Per-source owned flags, positional. Defaults to none owned. */
  owned: boolean[] = [],
): LibraryRow {
  return {
    id,
    list_status,
    media_titles: { title, title_en },
    entry_sources: slugs.map((slug, i) => ({
      is_hiatus: hiatus[i] ?? false,
      is_owned: owned[i] ?? false,
      sources: slug ? { slug } : null,
    })),
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
    <LibraryFilters initial={{ sort: DEFAULT_SORT, ...initial }}>
      <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
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
 * Opens the filter menu. Every control now lives behind this one trigger.
 *
 * The toggles deliberately leave the menu open, so a helper called after one
 * of them would otherwise find the trigger covered. Closing first makes every
 * helper safe to call from any state.
 */
async function openMenu() {
  const trigger = screen.queryByRole("button", { name: /^Filters:/ });
  if (!trigger) {
    // A menu is already open over it.
    await userEvent.keyboard("{Escape}");
  }
  await userEvent.click(screen.getByRole("button", { name: /^Filters:/ }));
}

/**
 * Pick a status or source, the way a user would: open the menu, open that
 * filter's submenu, click the item.
 *
 * Both submenus contain an "All" item, so the item lookup is scoped to the
 * submenu that was just opened rather than searched for document-wide.
 */
async function choose(group: "Status" | "Source", label: string) {
  await openMenu();
  await userEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${group}`) }));

  const items = await screen.findAllByRole("menuitemradio");
  const match = items.find((el) =>
    new RegExp(`^${label}`).test(el.textContent ?? ""),
  );
  if (!match) throw new Error(`No ${group} option matching ${label}`);
  await userEvent.click(match);
}

/** The checkbox item for one of the two boolean filters. */
async function toggleItem(name: RegExp) {
  await openMenu();
  const item = await screen.findByRole("menuitemcheckbox", { name });
  await userEvent.click(item);
  return item;
}

/** Reads a toggle's state without leaving the menu open for the next act. */
async function toggleState(name: RegExp) {
  await openMenu();
  const item = await screen.findByRole("menuitemcheckbox", { name });
  const checked = item.getAttribute("aria-checked");
  await userEvent.keyboard("{Escape}");
  return checked;
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
    await choose("Status", "Reading");
    expect(visibleIds()).toEqual([1, 2]);
  });

  it("matches a title on any of its sources, not just the first", async () => {
    setup();
    await choose("Source", "Tapas");
    // Row 4 lists webtoon first; it must still match on tapas.
    expect(visibleIds()).toEqual([3, 4]);
  });

  it("treats 'No source' as titles with no sources at all", async () => {
    setup();
    await choose("Source", "No source");
    expect(visibleIds()).toEqual([2]);
  });

  it("combines status and source", async () => {
    setup();
    await choose("Status", "Reading");
    await choose("Source", "Webtoon");
    expect(visibleIds()).toEqual([1]);
  });

  it("starts from the stored preference", () => {
    setup({ status: "completed", source: "" });
    expect(visibleIds()).toEqual([3]);
  });
});

describe("empty states", () => {
  it("distinguishes 'nothing synced' from 'nothing matches'", async () => {
    setup();
    expect(screen.queryByText("Nothing synced yet")).not.toBeInTheDocument();

    await choose("Status", "Completed");
    await choose("Source", "Webtoon");

    expect(screen.getByText("No titles match")).toBeInTheDocument();
    expect(screen.queryByText("Nothing synced yet")).not.toBeInTheDocument();
  });

  // An unfiltered shelf with nothing on it has not been synced — the chips
  // cannot be what is hiding a title, because there is none.
  it("uses the unfiltered empty state for an empty shelf", () => {
    render(
      <LibraryFilters
        initial={{ status: "", source: "", sort: DEFAULT_SORT }}
      >
        <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
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
    await choose("Status", "Reading");
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ status: "reading" });
  });

  // Regression: "" must be stored as the explicit `all` sentinel — null would
  // read as "never chose", and the old filter would come back on the next
  // visit. The chips used to clear by re-clicking the active one; in a radio
  // group that is a no-op (see below), so "All" is the route now.
  it("stores a cleared filter as the explicit sentinel", async () => {
    setup({ status: "reading", source: "" });
    await choose("Status", "All");
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ status: "all" });
    expect(visibleIds()).toEqual([1, 2, 3, 4]);
  });

  // The chips toggled: clicking the active one cleared the filter. A menu
  // item must not — an item showing itself as chosen that unsets on click is
  // a trap, and "All" is right there.
  it("leaves the filter alone when the active item is re-selected", async () => {
    setup({ status: "reading", source: "" });
    await choose("Status", "Reading");
    expect(saveLibraryPrefs).not.toHaveBeenCalled();
    expect(visibleIds()).toEqual([1, 2]);
  });

  // Clearing is four independent writes rather than one action, so each
  // filter that was set has to come back off — and the ones already off must
  // not be written at all.
  it("clears every active filter at once", async () => {
    setup({ status: "reading", source: "webtoon" });
    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Clear all" }));

    expect(saveLibraryPrefs).toHaveBeenCalledWith({ status: "all" });
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ source: "all" });
    expect(visibleIds()).toEqual([1, 2, 3, 4]);
  });

  // Nothing to clear means no dead row in the menu.
  it("offers no clear action on an unfiltered shelf", async () => {
    setup();
    await openMenu();
    expect(
      screen.queryByRole("menuitem", { name: "Clear all" }),
    ).not.toBeInTheDocument();
  });

  it("saves only the filter that changed", async () => {
    setup({ status: "reading", source: "webtoon" });
    await choose("Source", "Tapas");
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
        <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
        <LibraryGrid
          entries={SHELF}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );
  }

  const HIATUS = /Hide hiatus/;

  it("shows hiatus titles by default", async () => {
    setupShelf();
    expect(visibleIds()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await toggleState(HIATUS)).toBe("false");
  });

  it("hides only fully-paused titles when pressed", async () => {
    setupShelf();
    await toggleItem(HIATUS);

    // 5 goes; 6 stays, because it still updates on Tapas.
    expect(visibleIds()).toEqual([1, 2, 3, 4, 6]);
    expect(await toggleState(HIATUS)).toBe("true");
  });

  it("brings them back when pressed again", async () => {
    setupShelf();
    const item = await toggleItem(HIATUS);
    await userEvent.click(item);
    expect(visibleIds()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("persists the choice as a boolean, not a sentinel", async () => {
    setupShelf();
    await toggleItem(HIATUS);
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ hideHiatus: true });

    await toggleItem(HIATUS);
    // false must survive as false — it is "show them again", not an empty
    // value to be normalised to the `all` sentinel.
    expect(saveLibraryPrefs).toHaveBeenLastCalledWith({ hideHiatus: false });
  });

  it("starts pressed when the stored preference says so", async () => {
    render(
      <LibraryFilters
        initial={{ status: "", source: "", hideHiatus: true, sort: DEFAULT_SORT }}
      >
        <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
        <LibraryGrid
          entries={SHELF}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );

    expect(await toggleState(HIATUS)).toBe("true");
    expect(visibleIds()).toEqual([1, 2, 3, 4, 6]);
  });

  it("narrows alongside a source chip rather than replacing it", async () => {
    setupShelf({ status: "", source: "tapas" });
    await toggleItem(HIATUS);
    // On Tapas: 3, 4 and 6 — none of which is paused everywhere.
    expect(visibleIds()).toEqual([3, 4, 6]);
  });

  it("shows the filtered empty state when it hides the last title", async () => {
    render(
      <LibraryFilters initial={{ status: "", source: "", sort: DEFAULT_SORT }}>
        <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
        <LibraryGrid
          entries={[row(9, "reading", ["webtoon"], "Title 9", null, [true])]}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );

    await toggleItem(HIATUS);
    // "your filters hid it", not "nothing synced yet" — the shelf is not empty.
    expect(screen.getByText("No titles match")).toBeInTheDocument();
  });
});

describe("owned only toggle", () => {
  // 7 is owned on its only source; 8 is owned on one of two; 9 is owned
  // nowhere. Appended to the shared shelf so the existing rows keep their ids
  // — and note none of ROWS is owned, which is what the default-off tests
  // lean on.
  const SHELF = [
    ...ROWS,
    row(7, "reading", ["webtoon"], "Title 7", null, [], [true]),
    row(8, "reading", ["webtoon", "tapas"], "Title 8", null, [], [false, true]),
    row(9, "reading", ["webtoon"], "Title 9", null, [], [false]),
  ];

  function setupShelf(initial = { status: "", source: "" }) {
    return render(
      <LibraryFilters initial={{ sort: DEFAULT_SORT, ...initial }}>
        <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
        <LibraryGrid
          entries={SHELF}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );
  }

  const OWNED = /Owned only/;

  it("shows the whole shelf by default", async () => {
    setupShelf();
    expect(visibleIds()).toEqual([1, 2, 3, 4, 7, 8, 9]);
    expect(await toggleState(OWNED)).toBe("false");
  });

  it("keeps only owned titles when pressed", async () => {
    setupShelf();
    await toggleItem(OWNED);

    // 8 stays on the strength of its Tapas copy; 9 and the unowned ROWS go.
    expect(visibleIds()).toEqual([7, 8]);
    expect(await toggleState(OWNED)).toBe("true");
  });

  it("brings the rest back when pressed again", async () => {
    setupShelf();
    const item = await toggleItem(OWNED);
    await userEvent.click(item);
    expect(visibleIds()).toEqual([1, 2, 3, 4, 7, 8, 9]);
  });

  it("persists the choice as a boolean, not a sentinel", async () => {
    setupShelf();
    await toggleItem(OWNED);
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ ownedOnly: true });

    await toggleItem(OWNED);
    // false must survive as false — it is "show the whole shelf again", not an
    // empty value to be normalised to the `all` sentinel.
    expect(saveLibraryPrefs).toHaveBeenLastCalledWith({ ownedOnly: false });
  });

  it("starts pressed when the stored preference says so", async () => {
    render(
      <LibraryFilters
        initial={{ status: "", source: "", ownedOnly: true, sort: DEFAULT_SORT }}
      >
        <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
        <LibraryGrid
          entries={SHELF}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );

    expect(await toggleState(OWNED)).toBe("true");
    expect(visibleIds()).toEqual([7, 8]);
  });

  it("narrows alongside a source chip rather than replacing it", async () => {
    setupShelf({ status: "", source: "tapas" });
    await toggleItem(OWNED);
    // On Tapas: 4 and 8 — of which only 8 is owned anywhere.
    expect(visibleIds()).toEqual([8]);
  });

  it("shows the filtered empty state when nothing is owned", async () => {
    render(
      <LibraryFilters initial={{ status: "", source: "", sort: DEFAULT_SORT }}>
        <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
        <LibraryGrid
          entries={[row(1, "reading", ["webtoon"])]}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );

    await toggleItem(OWNED);
    // "your filters hid it", not "nothing synced yet" — the shelf has a title
    // on it, the user just owns none of it. This is the case that makes
    // off-by-default matter.
    expect(screen.getByText("No titles match")).toBeInTheDocument();
  });
});

describe("the hide-adult-titles toggle", () => {
  // The toggle is for a viewer who may see adult titles at all. An account
  // under the age floor never receives those rows (getLibrary removes them),
  // so an item here would filter an empty set.

  function setupNsfw(canSeeNsfw: boolean) {
    return render(
      <LibraryFilters
        canSeeNsfw={canSeeNsfw}
        initial={{ status: "", source: "", sort: DEFAULT_SORT }}
      >
        <LibraryFilterMenu statuses={STATUSES} sources={SOURCES} />
        <LibraryGrid
          entries={ROWS}
          emptyFiltered={<p>No titles match</p>}
          emptyUnfiltered={<p>Nothing synced yet</p>}
        />
      </LibraryFilters>,
    );
  }

  it("is offered to a confirmed adult", async () => {
    setupNsfw(true);
    await userEvent.click(screen.getByRole("button", { name: /filter/i }));

    expect(
      screen.getByRole("menuitemcheckbox", { name: "Hide adult titles" }),
    ).toBeInTheDocument();
  });

  it("is absent for an account under the age floor", async () => {
    setupNsfw(false);
    await userEvent.click(screen.getByRole("button", { name: /filter/i }));

    // Absent, not disabled: it cannot change what is on screen, and it would
    // advertise a category the app is not offering this account.
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Hide adult titles" }),
    ).toBeNull();
  });

  it("leaves the neighbouring toggles alone either way", async () => {
    setupNsfw(false);
    await userEvent.click(screen.getByRole("button", { name: /filter/i }));

    expect(
      screen.getByRole("menuitemcheckbox", { name: "Hide hiatus" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Owned only" }),
    ).toBeInTheDocument();
  });
});
