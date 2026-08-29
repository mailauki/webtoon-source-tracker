import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveLibraryPrefs } = vi.hoisted(() => ({
  saveLibraryPrefs: vi.fn(async () => {}),
}));
vi.mock("@/app/actions/library-prefs", () => ({ saveLibraryPrefs }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

// Importing the filter context pulls in the grid, and with it EntryCard and
// the server actions behind its menu — none of which this test renders.
vi.mock("@/components/entry-card", () => ({
  EntryCard: () => null,
}));

// next/image needs a configured loader; the cover is not what is under test.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a stub, not markup
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

// The dialog links to the entry page; next/link needs no more than an anchor
// for what these tests assert.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { HeaderSearch } from "@/components/header-search";
import { LibraryFilters } from "@/components/library-grid";
import { RandomPick } from "@/components/random-pick";
import { DEFAULT_SORT } from "@/lib/data/library-prefs";
import type { LibraryRow } from "@/lib/data/entries";

/** Only the fields the dice and its dialog actually read. */
function row(
  id: number,
  list_status: string,
  slugs: string[] = [],
  title = `Title ${id}`,
): LibraryRow {
  return {
    id,
    list_status,
    num_chapters_read: 10,
    media_titles: { id, title, title_en: null, main_picture_url: null, num_chapters: 100 },
    entry_sources: slugs.map((slug) => ({
      id: `${id}-${slug}`,
      is_primary: false,
      is_paid: false,
      is_official: true,
      sources: { slug, name: slug },
    })),
  } as unknown as LibraryRow;
}

const ROWS = [
  row(1, "reading", ["webtoon"], "Solo Leveling"),
  row(2, "reading", [], "Omniscient Reader"),
  row(3, "completed", ["tapas"], "Lore Olympus"),
];

function setup({ entries = ROWS, status = "", source = "" } = {}) {
  return render(
    <LibraryFilters
      initial={{ status, source, sort: DEFAULT_SORT }}
      entries={entries}
    >
      {/* The query has no seed — it is typed, so the field has to be here. */}
      <HeaderSearch />
      <RandomPick />
    </LibraryFilters>,
  );
}

/** Puts the provider in the searching state the only way a user can. */
async function search(q: string) {
  await userEvent.click(screen.getByRole("button", { name: "Search titles" }));
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Search titles" }),
    q,
  );
}

const roll = () => screen.getByRole("button", { name: /pick something to read/i });
const dialogTitle = () =>
  within(screen.getByRole("dialog")).getByTestId("picked-title").textContent;


afterEach(cleanup);

describe("RandomPick", () => {
  it("reveals a title from the shelf when rolled", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(roll());

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect([
      "Solo Leveling",
      "Omniscient Reader",
      "Lore Olympus",
    ]).toContain(dialogTitle());
  });

  it("only picks from titles the active chips leave visible", async () => {
    const user = userEvent.setup();
    setup({ status: "completed", entries: [...ROWS, row(4, "completed", [], "Bastard")] });

    await user.click(roll());

    expect(["Lore Olympus", "Bastard"]).toContain(dialogTitle());
  });

  it("only picks from titles matching the active source chip", async () => {
    const user = userEvent.setup();
    const extra = row(4, "reading", [], "Bastard");
    setup({ source: "none", entries: [...ROWS, extra] });

    await user.click(roll());

    expect(["Omniscient Reader", "Bastard"]).toContain(dialogTitle());
  });

  // The whole point of a re-roll: pressing it must work through the shelf
  // rather than re-offering the cover already on screen.
  //
  // Asserting only that two consecutive picks differ would be a coin flip on a
  // two-title shelf — an implementation ignoring `seen` passes it half the
  // time. Rolling once per candidate and demanding every title appear exactly
  // once can only pass if the picks are genuinely repeat-free.
  it("works through every title before repeating one", async () => {
    const user = userEvent.setup();
    // Pinned so the assertion tests the never-repeat rule rather than luck:
    // always drawing the first of whatever pool it is handed makes an honest
    // implementation walk the shelf and a `seen`-ignoring one stick on one
    // title, deterministically, every run.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const shelf = [
      row(1, "reading", [], "Solo Leveling"),
      row(2, "reading", [], "Omniscient Reader"),
      row(3, "reading", [], "Tower of God"),
      row(4, "reading", [], "Bastard"),
    ];
    setup({ entries: shelf, status: "reading" });

    await user.click(roll());
    const drawn = [dialogTitle()];

    for (let i = 1; i < shelf.length; i++) {
      await user.click(screen.getByRole("button", { name: /roll again/i }));
      drawn.push(dialogTitle());
    }

    expect([...drawn].sort()).toEqual([
      "Bastard",
      "Omniscient Reader",
      "Solo Leveling",
      "Tower of God",
    ]);
  });

  it("links the picked title to its entry page", async () => {
    const user = userEvent.setup();
    setup({ status: "reading", entries: [ROWS[0], ROWS[1]] });

    await user.click(roll());

    const id = dialogTitle() === "Solo Leveling" ? 1 : 2;
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute(
      "href",
      `/entry/${id}`,
    );
  });

  // A search already bypasses the chips, and rolling a die against a title the
  // user just typed by name is incoherent.
  it("is not offered while a search is active", async () => {
    setup();
    await search("solo");

    expect(
      screen.queryByRole("button", { name: /pick something to read/i }),
    ).not.toBeInTheDocument();
  });

  it("is disabled when the filters leave nothing to pick from", () => {
    setup({ status: "dropped" });

    expect(roll()).toBeDisabled();
  });

  // Rolling a die over one title is theatre: it can only ever return that
  // title, so the button says so instead of pretending to choose.
  it("is disabled when the filters leave only one title", () => {
    setup({ status: "completed" });

    expect(roll()).toBeDisabled();
  });
});
