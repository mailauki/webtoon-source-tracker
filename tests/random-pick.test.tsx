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

/**
 * An attachment: a bare slug where only the source chip cares, or the fuller
 * shape where the read link does.
 */
type SourceSpec =
  | string
  | { slug: string; name?: string; url?: string; is_primary?: boolean };

/** Fixture clock, so `daysAgo` in a row reads as "touched N days ago". */
const NOW = new Date("2026-03-01T00:00:00Z").getTime();

/** Only the fields the dice and its dialog actually read. */
function row(
  id: number,
  list_status: string,
  sources: SourceSpec[] = [],
  title = `Title ${id}`,
  daysAgo = 1,
): LibraryRow {
  return {
    id,
    list_status,
    mal_updated_at: new Date(NOW - daysAgo * 86_400_000).toISOString(),
    num_chapters_read: 10,
    media_titles: { id, title, title_en: null, main_picture_url: null, num_chapters: 100 },
    entry_sources: sources.map((spec) => {
      const at = typeof spec === "string" ? { slug: spec } : spec;
      return {
        id: `${id}-${at.slug}`,
        // Quick-add leaves this empty, which is the case with no read link.
        url: at.url ?? null,
        is_primary: at.is_primary ?? false,
        is_paid: false,
        is_official: true,
        sources: { slug: at.slug, name: at.name ?? at.slug },
      };
    }),
  } as unknown as LibraryRow;
}

const ROWS = [
  row(1, "reading", ["webtoon"], "Solo Leveling"),
  row(2, "reading", [], "Omniscient Reader"),
  row(3, "completed", ["tapas"], "Lore Olympus"),
];

function setup({
  entries = ROWS,
  status = "",
  source = "",
  hideHiatus = false,
} = {}) {
  return render(
    <LibraryFilters
      initial={{ status, source, hideHiatus, sort: DEFAULT_SORT }}
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

const roll = () => screen.getByRole("button", { name: /surprise me/i });
const neglected = () =>
  screen.getByRole("button", { name: /haven't read in a while/i });
const planPick = () => screen.getByRole("button", { name: /from plan to read/i });
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
      screen.queryByRole("button", { name: /surprise me/i }),
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

describe("the pick's read link", () => {
  /** Pins the draw to the first candidate so the pick is known. */
  function shelf(first: SourceSpec[]) {
    vi.spyOn(Math, "random").mockReturnValue(0);
    return {
      entries: [
        row(1, "reading", first, "Solo Leveling"),
        row(2, "reading", [], "Omniscient Reader"),
      ],
      status: "reading",
    };
  }

  const readLink = () => screen.queryByRole("link", { name: /^Read on/ });

  it("offers the source the picked title is read at", async () => {
    const user = userEvent.setup();
    setup(
      shelf([
        { slug: "webtoon", name: "Webtoon", url: "https://webtoon.test/sl" },
      ]),
    );

    await user.click(roll());

    expect(dialogTitle()).toBe("Solo Leveling");
    expect(readLink()).toHaveAttribute("href", "https://webtoon.test/sl");
    expect(readLink()).toHaveAccessibleName("Read on Webtoon");
  });

  it("opens the reading link away from the app", async () => {
    const user = userEvent.setup();
    setup(shelf([{ slug: "webtoon", url: "https://webtoon.test/sl" }]));

    await user.click(roll());

    expect(readLink()).toHaveAttribute("target", "_blank");
    expect(readLink()).toHaveAttribute("rel", "noopener noreferrer");
  });

  // The same rule the card follows, so the two never point somewhere different
  // for the same title.
  it("points at the primary source rather than the first attached", async () => {
    const user = userEvent.setup();
    setup(
      shelf([
        { slug: "tapas", name: "Tapas", url: "https://tapas.test/sl" },
        {
          slug: "webtoon",
          name: "Webtoon",
          url: "https://webtoon.test/sl",
          is_primary: true,
        },
      ]),
    );

    await user.click(roll());

    expect(readLink()).toHaveAttribute("href", "https://webtoon.test/sl");
  });

  // A source quick-added from the card menu carries no URL, so there is
  // nowhere to send anyone — the reveal already says as much.
  it("offers no read link when no source has a url", async () => {
    const user = userEvent.setup();
    setup(shelf(["webtoon"]));

    await user.click(roll());

    expect(readLink()).not.toBeInTheDocument();
    // The entry page is still one click away, which is where a URL gets added.
    expect(screen.getByRole("link", { name: /open/i })).toBeInTheDocument();
  });

  it("offers no read link when the pick has no sources at all", async () => {
    const user = userEvent.setup();
    setup(shelf([]));

    await user.click(roll());

    expect(readLink()).not.toBeInTheDocument();
  });
});

/**
 * The two shortcut modes. Both answer a question the chips cannot express, so
 * both must reach past whatever the chips currently say.
 */
describe("the mode buttons", () => {
  // Five is the floor on the neglected slice, so a shelf this size makes
  // every parked title eligible and the assertions are about status, not the
  // slice — which pick-random.test.ts covers directly.
  const SHELF = [
    row(1, "reading", [], "Solo Leveling", 90),
    row(2, "on_hold", [], "Omniscient Reader", 60),
    row(3, "completed", [], "Lore Olympus", 30),
    row(4, "plan_to_read", [], "Tower of God", 10),
    row(5, "plan_to_read", [], "Bastard", 5),
  ];

  it("draws only from plan-to-read titles", async () => {
    const user = userEvent.setup();
    setup({ entries: SHELF });

    await user.click(planPick());

    expect(["Tower of God", "Bastard"]).toContain(dialogTitle());
  });

  it("draws only from titles that were started and parked", async () => {
    const user = userEvent.setup();
    setup({ entries: SHELF });

    await user.click(neglected());

    expect(["Solo Leveling", "Omniscient Reader"]).toContain(dialogTitle());
  });

  // The modes are shortcuts past the chips, not narrowings of them: asking
  // for something off the plan pile while the Reading chip is up must still
  // return a plan-to-read title rather than nothing.
  it("reaches past the active chips", async () => {
    const user = userEvent.setup();
    setup({ entries: SHELF, status: "reading" });

    await user.click(planPick());

    expect(["Tower of God", "Bastard"]).toContain(dialogTitle());
  });

  // The plain roll is the one that still means "out of what I can see".
  it("leaves the surprise roll bound to the chips", async () => {
    const user = userEvent.setup();
    setup({
      entries: [...SHELF, row(6, "plan_to_read", [], "Noblesse", 2)],
      status: "plan_to_read",
    });

    await user.click(roll());

    expect(["Tower of God", "Bastard", "Noblesse"]).toContain(dialogTitle());
  });

  // Each button answers for its own pool. A shelf with nothing parked should
  // disable the neglected button while the others stay live.
  it("disables only the mode that has nothing to draw from", () => {
    setup({
      entries: [
        row(1, "plan_to_read", [], "Tower of God", 10),
        row(2, "plan_to_read", [], "Bastard", 5),
      ],
    });

    expect(neglected()).toBeDisabled();
    expect(planPick()).toBeEnabled();
  });

  it("disables a mode holding only one title", () => {
    // One candidate can only ever return itself — the same reasoning the
    // plain roll already follows.
    setup({
      entries: [
        row(1, "plan_to_read", [], "Tower of God", 10),
        row(2, "reading", [], "Solo Leveling", 90),
        row(3, "reading", [], "Omniscient Reader", 60),
      ],
    });

    expect(planPick()).toBeDisabled();
  });

  // Each mode is its own draw. Carrying the exclusions across would make a
  // switch to a small pool find everything already seen and reset instantly,
  // throwing away the never-repeat rule on the pool the user just asked for.
  it("starts a fresh no-repeat cycle when the mode changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, "random").mockReturnValue(0);
    setup({
      entries: [
        row(1, "reading", [], "Solo Leveling", 90),
        row(2, "reading", [], "Omniscient Reader", 60),
        row(3, "plan_to_read", [], "Tower of God", 10),
        row(4, "plan_to_read", [], "Bastard", 5),
      ],
    });

    // Exhaust the neglected pool, then switch. With `seen` carried over, the
    // plan pool would be drawn from a set already holding ids 1 and 2 — the
    // switch has to clear it.
    await user.click(neglected());
    await user.click(screen.getByRole("button", { name: /roll again/i }));
    await user.keyboard("{Escape}");

    await user.click(planPick());
    const first = dialogTitle();
    await user.click(screen.getByRole("button", { name: /roll again/i }));

    expect(dialogTitle()).not.toBe(first);
    expect(["Tower of God", "Bastard"]).toContain(first);
  });

  it("hides the whole banner during a search", async () => {
    setup({ entries: SHELF });
    await search("solo");

    expect(
      screen.queryByRole("button", { name: /from plan to read/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /haven't read in a while/i }),
    ).not.toBeInTheDocument();
  });
});

// The toggle is the user saying paused titles are not worth their time. A die
// that can still land on one contradicts the shelf it sits above.
describe("the hiatus toggle", () => {
  /** A row whose every source has paused. */
  const paused = (id: number, title: string, list_status = "reading") =>
    ({
      ...row(id, list_status, [], title, 90),
      entry_sources: [{ id: `${id}-w`, is_hiatus: true, sources: { slug: "webtoon" } }],
    }) as unknown as LibraryRow;

  it("keeps the surprise roll off paused titles", async () => {
    const user = userEvent.setup();
    setup({
      hideHiatus: true,
      status: "reading",
      entries: [
        paused(1, "Solo Leveling"),
        row(2, "reading", [], "Omniscient Reader", 60),
        row(3, "reading", [], "Tower of God", 30),
      ],
    });

    await user.click(roll());

    expect(dialogTitle()).not.toBe("Solo Leveling");
  });

  it("keeps the mode buttons off paused titles too", async () => {
    const user = userEvent.setup();
    setup({
      hideHiatus: true,
      entries: [
        paused(1, "Solo Leveling", "plan_to_read"),
        row(2, "plan_to_read", [], "Tower of God", 60),
        row(3, "plan_to_read", [], "Bastard", 30),
      ],
    });

    await user.click(planPick());

    expect(dialogTitle()).not.toBe("Solo Leveling");
  });
});
