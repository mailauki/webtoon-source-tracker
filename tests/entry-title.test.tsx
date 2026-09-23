/**
 * Which of a title's two names each surface shows.
 *
 * lib/data/display-title.ts is unit-tested directly in display-title.test.ts;
 * this suite is about the wiring — that the heading, the accessible name and
 * the per-source labels all took the same one, since a card announcing a name
 * it does not display is the failure a unit test cannot see.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Same hoisted stubs as the card suite: the card reaches the menu and dialog,
// which reach server-only action modules.
vi.mock("@/app/actions/progress", () => ({
  updateProgress: vi.fn(async () => ({ ok: true, message: "Saved" })),
}));
vi.mock("@/app/actions/entry-sources", () => ({
  addEntrySource: vi.fn(async () => ({ message: "Source added." })),
  updateEntrySource: vi.fn(async () => ({ message: "Source updated." })),
  removeEntrySource: vi.fn(async () => ({ message: "Source removed." })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { EntryCard, type EntryLayout } from "@/components/entry-card";
import type { LibraryRow } from "@/lib/data/entries";

const ROMAJI = "Na Honjaman Level Up";
const ENGLISH = "Solo Leveling";

function row(titleEn: string | null): LibraryRow {
  return {
    id: 7,
    list_status: "reading",
    num_chapters_read: 41,
    entry_sources: [
      {
        id: 1,
        url: "https://tapas.io/series/x",
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
      title: ROMAJI,
      title_en: titleEn,
      num_chapters: 179,
      main_picture_url: null,
      mal_status: "currently_publishing",
    },
  } as unknown as LibraryRow;
}

afterEach(cleanup);

// Both layouts of the one card. They used to be two components; the suite
// stayed parameterised when they merged, because "the grid says one name and
// the list says another" is exactly the drift the merge was meant to end.
describe.each<[string, EntryLayout]>([
  ["grid", "grid"],
  ["row", "row"],
])("EntryCard (%s layout)", (_name, layout) => {
  const Component = (props: { entry: LibraryRow }) => (
    <EntryCard {...props} layout={layout} />
  );
  it("shows the English title when MAL has one", () => {
    render(<Component entry={row(ENGLISH)} />);

    expect(screen.getByRole("heading", { name: ENGLISH })).toBeInTheDocument();
    expect(screen.queryByText(ROMAJI)).not.toBeInTheDocument();
  });

  it("falls back to the canonical title when it does not", () => {
    render(<Component entry={row(null)} />);

    expect(screen.getByRole("heading", { name: ROMAJI })).toBeInTheDocument();
  });

  // The link's accessible name, the read button's and the ⋯ button's are all
  // built from the same binding. A card that reads out one name and shows
  // another is worse than either name alone.
  it("announces the same name it displays", () => {
    render(<Component entry={row(ENGLISH)} />);

    expect(screen.getByRole("link", { name: ENGLISH })).toHaveAttribute(
      "href",
      "/entry/7",
    );
    expect(
      screen.getByRole("link", { name: `Read ${ENGLISH} on Tapas` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Actions for ${ENGLISH}` }),
    ).toBeInTheDocument();
  });
});
