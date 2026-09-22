/**
 * The two axes the unified card branches on.
 *
 * `layout` is how it is drawn and the caller picks it; `view.entry` is what
 * there is to draw and the data decides. They are independent, which is the
 * whole reason the three old components (EntryCard, EntryRow, CollectionCard)
 * collapsed into one — so the thing worth testing is that each combination
 * shows what it should and, just as much, leaves out what it has no business
 * showing.
 *
 * The per-surface behaviour each old component already had — the read button,
 * the badges, the menu, the title binding — stays in entry-card.test.tsx,
 * entry-card-menu.test.tsx and entry-title.test.tsx. This suite is only about
 * the branching the merge introduced.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The card reaches the menu and the dialog, which reach server-only action
// modules. Same hoisted stubs as the sibling suites.
vi.mock("@/app/actions/progress", () => ({
  updateProgress: vi.fn(async () => ({ ok: true, message: "Saved" })),
}));
vi.mock("@/app/actions/entry-sources", () => ({
  addEntrySource: vi.fn(async () => ({ message: "Source added." })),
  updateEntrySource: vi.fn(async () => ({ message: "Source updated." })),
  removeEntrySource: vi.fn(async () => ({ message: "Source removed." })),
}));
vi.mock("@/app/actions/add-entry", () => ({
  addEntry: vi.fn(async () => ({ ok: true, message: "Added", entryId: 12 })),
}));
vi.mock("@/app/actions/collections", () => ({
  removeFromCollection: vi.fn(async () => ({ message: "Removed." })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The Add button refreshes on success so the card comes back as a tracked
// one. Nothing here exercises that path; the router just has to exist.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { EntryCard } from "@/components/entry-card";
import type { LibraryRow } from "@/lib/data/entries";
import { collectionView } from "@/lib/data/entry-view";
import type { CollectionItem } from "@/lib/data/collection-items";

const NAME = "Tower of God";

function row(): LibraryRow {
  return {
    id: 7,
    list_status: "reading",
    num_chapters_read: 41,
    entry_sources: [
      {
        id: 1,
        url: "https://tapas.io/series/tog",
        is_primary: true,
        is_paid: false,
        is_official: true,
        is_hiatus: false,
        is_owned: false,
        chapters_owned: null,
        sources: { id: 1, name: "Tapas" },
      },
    ],
    media_titles: {
      id: 3,
      mal_media_id: 44347,
      title: NAME,
      title_en: null,
      num_chapters: 179,
      main_picture_url: null,
      mal_status: "currently_publishing",
    },
  } as unknown as LibraryRow;
}

/** One collection item. `entryId` is what makes it tracked or not. */
function item(entryId: number | null, note: string | null = null) {
  return {
    id: 99,
    position: 0,
    note,
    entryId,
    media_titles: {
      id: 3,
      mal_media_id: 44347,
      title: NAME,
      title_en: null,
      main_picture_url: null,
      mal_media_kind: "manhwa",
      num_chapters: 179,
      mal_status: "currently_publishing",
    },
  } as unknown as CollectionItem;
}

afterEach(cleanup);

describe.each(["grid", "row"] as const)("%s layout", (layout) => {
  describe("a library row", () => {
    it("shows the status, the progress and the way to read it", () => {
      render(<EntryCard entry={row()} layout={layout} />);

      expect(screen.getByRole("heading", { name: NAME })).toBeInTheDocument();
      expect(screen.getByText("Reading")).toBeInTheDocument();
      expect(screen.getByText("41 / 179")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: `Read ${NAME} on Tapas` }),
      ).toBeInTheDocument();
    });

    it("links to its entry page", () => {
      render(<EntryCard entry={row()} layout={layout} />);

      expect(screen.getByRole("link", { name: NAME })).toHaveAttribute(
        "href",
        "/entry/7",
      );
    });

    // The Add button is the untracked card's one action. Offering it for a
    // title already on the shelf would add a second copy of it.
    it("does not offer to add a title already tracked", () => {
      render(<EntryCard entry={row()} layout={layout} />);

      expect(
        screen.queryByRole("button", { name: /add/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("an untracked catalog title", () => {
    it("offers to add it, and links nowhere", () => {
      render(<EntryCard view={collectionView(item(null))} layout={layout} />);

      expect(screen.getByRole("heading", { name: NAME })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /add/i }),
      ).toBeInTheDocument();
      // No entry page exists yet, so the card is not a link to one.
      expect(
        screen.queryByRole("link", { name: NAME }),
      ).not.toBeInTheDocument();
    });

    /**
     * A collection item carries only the catalog row — no status, no chapters
     * read, no attached sources. Inventing a "Reading" or a "0 / 179" for it
     * would be the card reporting data the query never fetched.
     */
    it("shows no status, progress or read button", () => {
      render(<EntryCard view={collectionView(item(null))} layout={layout} />);

      expect(screen.queryByText("Reading")).not.toBeInTheDocument();
      expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /^Read / }),
      ).not.toBeInTheDocument();
    });

    it("carries the shelf's editorial note when there is one", () => {
      render(
        <EntryCard
          view={collectionView(item(null, "Where every webtoon reader starts."))}
          layout={layout}
        />,
      );

      expect(
        screen.getByText("Where every webtoon reader starts."),
      ).toBeInTheDocument();
    });
  });

  /**
   * The third shape, and the one the two booleans do NOT collapse into each
   * other: a collection item the viewer already tracks. It has an entry page
   * to link to, but the collection query fetched none of the tracked
   * furniture — so it links, says so, and offers no Add.
   */
  describe("a collection item already in the library", () => {
    it("links to the entry and drops the Add button", () => {
      render(<EntryCard view={collectionView(item(12))} layout={layout} />);

      expect(screen.getByRole("link", { name: NAME })).toHaveAttribute(
        "href",
        "/entry/12",
      );
      expect(
        screen.queryByRole("button", { name: /add/i }),
      ).not.toBeInTheDocument();
    });

    it("says it is already on the shelf", () => {
      render(<EntryCard view={collectionView(item(12))} layout={layout} />);

      expect(screen.getByText("In library")).toBeInTheDocument();
    });
  });

  // The remove button is the owning collection's affordance, not the card's.
  describe("removable", () => {
    it("offers removal only when the caller asks for it", () => {
      const { rerender } = render(
        <EntryCard view={collectionView(item(null))} layout={layout} />,
      );
      expect(
        screen.queryByRole("button", { name: /Remove/ }),
      ).not.toBeInTheDocument();

      rerender(
        <EntryCard
          view={collectionView(item(null))}
          layout={layout}
          removable={{ collectionId: 4, itemId: 99 }}
        />,
      );
      expect(
        screen.getByRole("button", { name: `Remove ${NAME} from this collection` }),
      ).toBeInTheDocument();
    });

    /**
     * The remove form posts the `collection_items` id, not the catalog id.
     * They are different numbers and the action would silently remove the
     * wrong placement — or nothing — if the card sent the wrong one.
     */
    it("posts the placement id, not the title id", () => {
      const { container } = render(
        <EntryCard
          view={collectionView(item(null))}
          layout={layout}
          removable={{ collectionId: 4, itemId: 99 }}
        />,
      );

      expect(
        container.querySelector('input[name="item_id"]'),
      ).toHaveValue("99");
      expect(
        container.querySelector('input[name="collection_id"]'),
      ).toHaveValue("4");
    });
  });
});
