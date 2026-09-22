import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The card pulls in the menu and the dialog, which reach through to
// server-only action modules. Same hoisted stubs as the menu suite.
vi.mock("@/app/actions/progress", () => ({
  updateProgress: vi.fn(async () => ({ ok: true, message: "Saved" })),
}));
vi.mock("@/app/actions/entry-sources", () => ({
  addEntrySource: vi.fn(async () => ({ message: "Source added." })),
  updateEntrySource: vi.fn(async () => ({ message: "Source updated." })),
  removeEntrySource: vi.fn(async () => ({ message: "Source removed." })),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { EntryCard } from "@/components/entry-card";
import type { LibraryRow } from "@/lib/data/entries";
import { readingLink } from "@/lib/data/source-links";

type Attachment = LibraryRow["entry_sources"][number];

/**
 * One `entry_sources` row. Overrides are loosely typed on purpose: the row
 * shape comes from the PostgREST select, and these tests only ever set the few
 * fields the read button reads.
 */
function source(overrides: Record<string, unknown> = {}): Attachment {
  return {
    id: 1,
    url: "https://tapas.io/series/tog",
    is_primary: false,
    is_paid: false,
    is_official: true,
    is_hiatus: false,
    is_owned: false,
    chapters_owned: null,
    sources: { id: 1, name: "Tapas" },
    ...overrides,
  } as unknown as Attachment;
}

function row(
  sources: Attachment[] = [],
  title: {
    num_chapters?: number | null;
    mal_status?: string | null;
    nsfw?: string | null;
  } = {},
): LibraryRow {
  return {
    id: 7,
    list_status: "reading",
    num_chapters_read: 41,
    entry_sources: sources,
    media_titles: {
      title: "Tower of God",
      num_chapters: 179,
      main_picture_url: null,
      mal_status: "currently_publishing",
      ...title,
    },
  } as unknown as LibraryRow;
}

/** A finished 179-chapter series — the only shape that can be owned outright. */
const FINISHED = { num_chapters: 179, mal_status: "finished" };

/** Chapters 1–n as the multirange Postgres would hand back. */
const upTo = (n: number) => `{[1,${n + 1})}`;

afterEach(cleanup);

describe("card read button", () => {
  it("puts the reading link on the card, beside the menu trigger", () => {
    render(<EntryCard entry={row([source({ is_primary: true })])} />);

    // The cover links to the entry page and opens the quick menu; the corner
    // link goes straight to the source. Two anchors, neither nested in the
    // other — a nested one would be hoisted out and break hydration.
    expect(
      screen.getByRole("link", { name: /^Tower of God/ }),
    ).toHaveAttribute("href", "/entry/7");
    expect(
      screen.getByRole("link", { name: "Read Tower of God on Tapas" }),
    ).toHaveAttribute("href", "https://tapas.io/series/tog");
  });

  it("opens the reading link away from the app", () => {
    render(<EntryCard entry={row([source()])} />);

    const link = screen.getByRole("link", { name: /^Read / });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("offers no read button when nothing is linkable", () => {
    render(<EntryCard entry={row([source({ url: null })])} />);

    expect(screen.queryByRole("link", { name: /^Read / })).not.toBeInTheDocument();
    // The card itself still opens the menu, which is where the URL gets
    // filled in from.
    expect(
      screen.getByRole("link", { name: /^Tower of God/ }),
    ).toBeInTheDocument();
  });

  it("offers no read button when the entry has no sources at all", () => {
    render(<EntryCard entry={row()} />);
    expect(screen.queryByRole("link", { name: /^Read / })).not.toBeInTheDocument();
  });

  // The read link sits over the cover, which is now the menu trigger. It is a
  // sibling rather than a child, so a tap on it must reach the source and not
  // open the menu underneath.
  it("does not open the menu when the read link is tapped", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={row([source({ is_primary: true })])} />);

    await user.click(screen.getByRole("link", { name: /^Read / }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("readingLink", () => {
  it("picks the primary source, not merely the first one", () => {
    const attached = [
      source({ id: 1, url: "https://a.test", sources: { id: 1, name: "A" } }),
      source({
        id: 2,
        url: "https://b.test",
        is_primary: true,
        sources: { id: 2, name: "B" },
      }),
    ];

    expect(readingLink(attached)?.id).toBe(2);
  });

  it("falls back to the first linkable source when none is primary", () => {
    const attached = [
      source({ id: 1, url: null }),
      source({ id: 2, url: "https://b.test" }),
    ];

    expect(readingLink(attached)?.id).toBe(2);
  });

  // A primary source that was quick-added has no URL, so it cannot be the
  // button's target — the next source that can actually be opened wins.
  it("skips a primary source with no url", () => {
    const attached = [
      source({ id: 1, url: null, is_primary: true }),
      source({ id: 2, url: "https://b.test" }),
    ];

    expect(readingLink(attached)?.id).toBe(2);
  });

  it("returns nothing when no attachment can be opened", () => {
    const attached = [
      source({ id: 1, url: "   " }),
      source({ id: 2, url: "https://b.test", sources: null }),
    ];

    expect(readingLink(attached)).toBeNull();
  });

  it("returns nothing for an entry with no sources", () => {
    expect(readingLink([])).toBeNull();
  });
});

/** The badge, by its own tooltip — the pill icons carry the same word. */
const ownedBadge = () =>
  screen.queryByTitle("Owned at one or more of your sources");
const hiatusBadge = () => screen.queryByTitle("On hiatus at every source");

describe("card owned badge", () => {
  it("badges a finished series owned end to end", () => {
    render(
      <EntryCard
        entry={row(
          [source({ is_owned: true, chapters_owned: upTo(179) })],
          FINISHED,
        )}
      />,
    );
    expect(ownedBadge()).toBeInTheDocument();
  });

  // The rule the badge now carries: owning *some* of a series is already said
  // by the bookmark on the source pill, so the corner badge stays for the
  // whole thing. A badge after one bought chapter would be the loudest mark on
  // the card while meaning the least.
  it("does not badge a series only partly owned", () => {
    render(
      <EntryCard
        entry={row(
          [source({ is_owned: true, chapters_owned: upTo(40) })],
          FINISHED,
        )}
      />,
    );

    expect(ownedBadge()).not.toBeInTheDocument();
    // …but the pill still says this source is owned.
    expect(screen.getByTitle("Tapas · owned")).toBeInTheDocument();
  });

  it("counts every owned source towards the whole", () => {
    // 1–100 on one and 101–179 on the other is the series, between them.
    render(
      <EntryCard
        entry={row(
          [
            source({ id: 1, is_owned: true, chapters_owned: upTo(100) }),
            source({
              id: 2,
              is_owned: true,
              chapters_owned: "{[101,180)}",
              sources: { id: 2, name: "Webtoon" },
            }),
          ],
          FINISHED,
        )}
      />,
    );
    expect(ownedBadge()).toBeInTheDocument();
  });

  it("ignores a range left on a source that is not marked owned", () => {
    render(
      <EntryCard
        entry={row(
          [source({ is_owned: false, chapters_owned: upTo(179) })],
          FINISHED,
        )}
      />,
    );
    expect(ownedBadge()).not.toBeInTheDocument();
  });

  // A series still publishing has no "all" to own — the badge would go stale
  // the next time a chapter shipped.
  it("does not badge an ongoing series, however much is owned", () => {
    render(
      <EntryCard
        entry={row([source({ is_owned: true, chapters_owned: upTo(179) })], {
          num_chapters: 179,
          mal_status: "currently_publishing",
        })}
      />,
    );
    expect(ownedBadge()).not.toBeInTheDocument();
  });

  it("does not badge when MAL has no count to measure against", () => {
    render(
      <EntryCard
        entry={row([source({ is_owned: true, chapters_owned: upTo(40) })], {
          num_chapters: null,
          mal_status: "finished",
        })}
      />,
    );
    expect(ownedBadge()).not.toBeInTheDocument();
  });

  // MAL's count lags reality often enough that owning past it is ordinary, and
  // that is no reason to withhold the badge.
  it("badges when ownership runs past a stale total", () => {
    render(
      <EntryCard
        entry={row([source({ is_owned: true, chapters_owned: upTo(200) })], {
          num_chapters: 179,
          mal_status: "finished",
        })}
      />,
    );
    expect(ownedBadge()).toBeInTheDocument();
  });

  it("does not badge a title with no sources", () => {
    // Ownership hangs off a source, so there is nothing to have been bought.
    render(<EntryCard entry={row([], FINISHED)} />);
    expect(ownedBadge()).not.toBeInTheDocument();
  });

  // "Owned, not counted" cannot prove the whole series, so it gets the pill
  // rather than the badge.
  it("does not badge an owned source with no count recorded", () => {
    render(
      <EntryCard
        entry={row([source({ is_owned: true, chapters_owned: null })], FINISHED)}
      />,
    );

    expect(ownedBadge()).not.toBeInTheDocument();
    expect(screen.getByTitle("Tapas · owned")).toBeInTheDocument();
  });

  // Unlike No source and Hiatus, these two are not mutually exclusive: a
  // series you bought outright and that has since stopped updating is both.
  it("shows the owned and hiatus badges together", () => {
    render(
      <EntryCard
        entry={row(
          [
            source({
              is_owned: true,
              is_hiatus: true,
              chapters_owned: upTo(179),
            }),
          ],
          FINISHED,
        )}
      />,
    );

    expect(ownedBadge()).toBeInTheDocument();
    expect(hiatusBadge()).toBeInTheDocument();
  });

  // Paid is a property of the source; owned is what the user did about it.
  // The pill's tooltip is what keeps the two readable on the card.
  it("names both paid and owned on the source pill", () => {
    render(
      <EntryCard entry={row([source({ is_paid: true, is_owned: true })])} />,
    );
    expect(screen.getByTitle("Tapas · paid · owned")).toBeInTheDocument();
  });

  it("names paid alone on a source the user has not bought from", () => {
    render(<EntryCard entry={row([source({ is_paid: true })])} />);
    expect(screen.getByTitle("Tapas · paid")).toBeInTheDocument();
  });
});

describe("the adult-content badge", () => {
  // A label, not a gate: a card only reaches the grid if the viewer may see
  // the title at all, so this says what a cover is, it does not hide it.

  it("marks a title MyAnimeList rates as adult", () => {
    render(<EntryCard entry={row([], { nsfw: "gray" })} />);

    expect(screen.getByText("18+")).toBeInTheDocument();
  });

  it("marks an explicit title too", () => {
    render(<EntryCard entry={row([], { nsfw: "black" })} />);

    expect(screen.getByText("18+")).toBeInTheDocument();
  });

  it("leaves a safe title unmarked", () => {
    render(<EntryCard entry={row([], { nsfw: "white" })} />);

    expect(screen.queryByText("18+")).toBeNull();
  });

  it("leaves an unrated title unmarked rather than guessing", () => {
    // Null is "never fetched", not "adult" — the same direction isMature
    // takes everywhere else.
    render(<EntryCard entry={row([], { nsfw: null })} />);

    expect(screen.queryByText("18+")).toBeNull();
  });
});
