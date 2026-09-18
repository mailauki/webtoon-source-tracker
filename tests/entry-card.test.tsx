import { cleanup, render, screen } from "@testing-library/react";
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

function row(sources: Attachment[] = []): LibraryRow {
  return {
    id: 7,
    list_status: "reading",
    num_chapters_read: 41,
    entry_sources: sources,
    media_titles: {
      title: "Tower of God",
      num_chapters: 179,
      main_picture_url: null,
    },
  } as unknown as LibraryRow;
}

afterEach(cleanup);

describe("card read button", () => {
  it("puts the reading link on the card, next to the link to the entry page", () => {
    render(<EntryCard entry={row([source({ is_primary: true })])} />);

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
    // The card itself still goes to the entry page, where the URL gets filled in.
    expect(
      screen.getByRole("link", { name: /^Tower of God/ }),
    ).toBeInTheDocument();
  });

  it("offers no read button when the entry has no sources at all", () => {
    render(<EntryCard entry={row()} />);
    expect(screen.queryByRole("link", { name: /^Read / })).not.toBeInTheDocument();
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
  it("badges a title owned at its only source", () => {
    render(<EntryCard entry={row([source({ is_owned: true })])} />);
    expect(ownedBadge()).toBeInTheDocument();
  });

  // The `some` rule, from the card's side: one bought copy is enough, and
  // recording a second place you read it must not take the badge away.
  it("badges a title owned at only one of several sources", () => {
    render(
      <EntryCard
        entry={row([
          source({ id: 1, is_owned: false }),
          source({ id: 2, is_owned: true, sources: { id: 2, name: "Webtoon" } }),
        ])}
      />,
    );
    expect(ownedBadge()).toBeInTheDocument();
  });

  it("does not badge a title owned nowhere", () => {
    render(<EntryCard entry={row([source()])} />);
    expect(ownedBadge()).not.toBeInTheDocument();
  });

  it("does not badge a title with no sources", () => {
    // Ownership hangs off a source, so there is nothing to have been bought.
    render(<EntryCard entry={row()} />);
    expect(ownedBadge()).not.toBeInTheDocument();
  });

  // A counted source is still an owned source, and an uncounted one is too —
  // `is_owned` is the flag, `chapters_owned` only the amount.
  it("badges regardless of whether the chapters are counted", () => {
    render(
      <EntryCard entry={row([source({ is_owned: true, chapters_owned: 40 })])} />,
    );
    expect(ownedBadge()).toBeInTheDocument();
    cleanup();

    render(
      <EntryCard
        entry={row([source({ is_owned: true, chapters_owned: null })])}
      />,
    );
    expect(ownedBadge()).toBeInTheDocument();
  });

  // Unlike No source and Hiatus, these two are not mutually exclusive: a
  // series you bought and that has since stopped updating is both.
  it("shows the owned and hiatus badges together", () => {
    render(
      <EntryCard entry={row([source({ is_owned: true, is_hiatus: true })])} />,
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
