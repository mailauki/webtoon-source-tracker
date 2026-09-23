/**
 * The filter bar's own decisions, as opposed to what the chips select.
 *
 * `filterCollectionItems` is unit-tested in collection-filters.test.ts; this
 * is about what the bar chooses to *offer*. A category page's chips are
 * derived from the titles on it, so the interesting cases are the ones where
 * a chip would select nothing and is left out.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The cards reach the add/remove actions, which are server-only modules.
vi.mock("@/app/actions/add-entry", () => ({
  addEntry: vi.fn(async () => ({ ok: true, message: "Added", entryId: 1 })),
}));
vi.mock("@/app/actions/collections", () => ({
  removeFromCollection: vi.fn(async () => ({ message: "Removed." })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CollectionFilters } from "@/components/collection-filters";
import type { CollectionItem } from "@/lib/data/collection-items";

function item(
  id: number,
  tracked: { listStatus: string; sourceSlugs: string[] } | null = null,
): CollectionItem {
  return {
    id,
    position: id,
    note: null,
    media_titles: {
      id: id * 10,
      mal_media_id: id * 1000,
      title: `Title ${id}`,
      title_en: null,
      main_picture_url: null,
      num_chapters: 100,
      mal_status: "currently_publishing",
    },
    entryId: tracked ? id * 100 : null,
    tracked: tracked ? { entryId: id * 100, ...tracked } : null,
  } as unknown as CollectionItem;
}

/**
 * The bare `userEvent`, never `userEvent.setup()` — the same choice
 * tests/library-filters.test.tsx makes for the same menu. `setup()` installs
 * its own pointer handling, and Radix then dismisses a radio item's submenu
 * without committing the choice, so the filter silently never applies.
 */

/** Opens the filter menu, closing one already covering the trigger. */
async function openMenu() {
  if (!screen.queryByRole("button", { name: /^Filters:/ })) {
    await userEvent.keyboard("{Escape}");
  }
  await userEvent.click(screen.getByRole("button", { name: /^Filters:/ }));
}

/** Pick one radio item out of a submenu, the way a user would. */
async function choose(submenu: RegExp, option: string) {
  await openMenu();
  await userEvent.click(screen.getByRole("menuitem", { name: submenu }));

  const items = await screen.findAllByRole("menuitemradio");
  const match = items.find((el) => el.textContent?.trim() === option);
  if (!match) throw new Error(`No option matching ${option}`);
  await userEvent.click(match);
}

afterEach(cleanup);

describe("when the viewer tracks nothing here", () => {
  /**
   * Every chip would select either nothing or everything. A menu that cannot
   * usefully change what is on screen is a dead control.
   */
  it("offers no filters at all", () => {
    render(<CollectionFilters items={[item(1), item(2)]} />);

    expect(
      screen.queryByRole("button", { name: /^Filters:/ }),
    ).not.toBeInTheDocument();
  });

  it("still shows the titles", () => {
    render(<CollectionFilters items={[item(1), item(2)]} />);

    expect(screen.getByRole("heading", { name: "Title 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Title 2" })).toBeInTheDocument();
  });
});

describe("chips are derived from the titles on the page", () => {
  it("offers the library filter as soon as anything is tracked", () => {
    render(
      <CollectionFilters
        items={[item(1), item(2, { listStatus: "reading", sourceSlugs: [] })]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /^Filters:/ }),
    ).toBeInTheDocument();
  });

  /**
   * A submenu with one real option is a click that decides nothing: every
   * tracked title here is "Reading", so the chip cannot narrow anything.
   */
  it("hides the status submenu when every tracked title shares a status", async () => {
    render(
      <CollectionFilters
        items={[
          item(1),
          item(2, { listStatus: "reading", sourceSlugs: ["tapas"] }),
          item(3, { listStatus: "reading", sourceSlugs: ["tapas"] }),
        ]}
      />,
    );
    await openMenu();

    expect(screen.getByRole("menuitem", { name: /Library/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Status/ }),
    ).not.toBeInTheDocument();
  });

  it("offers the status submenu once two statuses are present", async () => {
    render(
      <CollectionFilters
        items={[
          item(2, { listStatus: "reading", sourceSlugs: [] }),
          item(3, { listStatus: "completed", sourceSlugs: [] }),
        ]}
      />,
    );
    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /Status/ }),
    ).toBeInTheDocument();
  });

  /**
   * The source list is the slugs actually attached here, plus "No source"
   * when some tracked title has nothing. Offering the app's whole source
   * catalog would be mostly chips that select nothing.
   */
  it("offers only the sources present, plus No source when one is missing", async () => {
    render(
      <CollectionFilters
        items={[
          item(2, { listStatus: "reading", sourceSlugs: ["tapas"] }),
          item(3, { listStatus: "completed", sourceSlugs: [] }),
        ]}
      />,
    );
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Source/ }));

    expect(
      await screen.findByRole("menuitemradio", { name: "Tapas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: "No source" }),
    ).toBeInTheDocument();
    // Never attached on this page, so never offered.
    expect(
      screen.queryByRole("menuitemradio", { name: "Webtoon" }),
    ).not.toBeInTheDocument();
  });
});

describe("filtering the grid", () => {
  const SHELF = [
    item(1),
    item(2, { listStatus: "reading", sourceSlugs: ["tapas"] }),
    item(3, { listStatus: "completed", sourceSlugs: ["tapas"] }),
  ];

  it("narrows the cards and says how many are left", async () => {
    render(<CollectionFilters items={SHELF} />);

    await choose(/Library/, "Not in my library");

    expect(screen.getByRole("heading", { name: "Title 1" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Title 2" }),
    ).not.toBeInTheDocument();
    // The count only appears once the chips have changed it.
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("shows no count while nothing is narrowed", () => {
    render(<CollectionFilters items={SHELF} />);

    expect(screen.queryByText(/ of 3$/)).not.toBeInTheDocument();
  });

  /**
   * An empty grid under a filter needs a way back, or the page looks broken
   * with no obvious cause.
   */
  it("offers a way out when the filters hide everything", async () => {
    // Everything tracked, so asking for the untracked half selects nothing.
    render(
      <CollectionFilters
        items={[
          item(1, { listStatus: "reading", sourceSlugs: [] }),
          item(2, { listStatus: "completed", sourceSlugs: [] }),
        ]}
      />,
    );

    await choose(/Library/, "Not in my library");

    expect(screen.getByText("No titles match")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Title 1" }),
    ).not.toBeInTheDocument();

    // The empty state's own button, not the menu — that is the point of it.
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("heading", { name: "Title 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Title 2" })).toBeInTheDocument();
  });
});
