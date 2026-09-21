import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CategoryNav } from "@/components/discover/category-nav";
import { tagEmoji } from "@/lib/data/tag-emoji";
import {
  groupByKind,
  PILLS_PER_GROUP,
  slugify,
  type Tag,
} from "@/lib/data/tag-items";

const tag = (over: Partial<Tag> & { id: number; name: string }): Tag => ({
  slug: slugify(over.name),
  description: null,
  kind: "genre",
  mal_genre_id: null,
  sort_order: 100,
  is_active: true,
  ...over,
});

const ROMANCE = tag({ id: 1, name: "Romance" });
const FANTASY = tag({ id: 2, name: "Fantasy" });
const WEBTOON = tag({ id: 3, name: "Webtoon", kind: "format" });
const REGRESSION = tag({ id: 4, name: "Regression", kind: "trope" });

/** The panel, so a query cannot stray into whatever renders beside it. */
const panel = () =>
  screen.getByRole("region", { name: "Browse by category" });

afterEach(cleanup);

describe("<CategoryNav>", () => {
  it("links every pill to that tag's page", () => {
    render(<CategoryNav groups={groupByKind([ROMANCE, WEBTOON])} />);

    expect(screen.getByRole("link", { name: "Romance" })).toHaveAttribute(
      "href",
      "/discover/tag/romance",
    );
    expect(screen.getByRole("link", { name: "Webtoon" })).toHaveAttribute(
      "href",
      "/discover/tag/webtoon",
    );
  });

  it("groups the pills by kind, under their plural headings", () => {
    render(
      <CategoryNav groups={groupByKind([WEBTOON, ROMANCE, REGRESSION])} />,
    );

    const kinds = within(panel())
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    // TAG_KINDS order, not the order they were handed over.
    expect(kinds).toEqual(["Genres", "Tropes", "Formats"]);
  });

  it("puts each tag under its own kind", () => {
    render(<CategoryNav groups={groupByKind([ROMANCE, FANTASY, WEBTOON])} />);

    const [genres, formats] = within(panel()).getAllByRole("list");
    expect(
      within(genres)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["🦄Fantasy", "💗Romance"]);
    expect(
      within(formats)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["📱Webtoon"]);
  });

  it("keeps the glyph out of the link's accessible name", () => {
    render(<CategoryNav groups={groupByKind([ROMANCE])} />);

    // It is rendered, but aria-hidden, so the link is named by the tag alone.
    const link = screen.getByRole("link", { name: "Romance" });
    expect(link).toHaveTextContent(tagEmoji(ROMANCE));
  });

  it("renders nothing at all when there are no categories", () => {
    const { container } = render(<CategoryNav groups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a long group short until it is expanded", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 14 }, (_, i) =>
      tag({ id: 100 + i, name: `Genre ${i + 1}` }),
    );

    render(<CategoryNav groups={groupByKind(many)} />);

    expect(within(panel()).getAllByRole("link")).toHaveLength(PILLS_PER_GROUP);

    await user.click(screen.getByRole("button", { name: "+6 more" }));

    expect(within(panel()).getAllByRole("link")).toHaveLength(14);
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("expands one kind without unfolding another", async () => {
    const user = userEvent.setup();
    const genres = Array.from({ length: 12 }, (_, i) =>
      tag({ id: 100 + i, name: `Genre ${i + 1}` }),
    );
    const tropes = Array.from({ length: 12 }, (_, i) =>
      tag({ id: 200 + i, name: `Trope ${i + 1}`, kind: "trope" }),
    );

    render(<CategoryNav groups={groupByKind([...genres, ...tropes])} />);

    const [genreRow, tropeRow] = within(panel()).getAllByRole("list");
    await user.click(within(genreRow).getByRole("button", { name: "+4 more" }));

    expect(within(genreRow).getAllByRole("link")).toHaveLength(12);
    expect(within(tropeRow).getAllByRole("link")).toHaveLength(PILLS_PER_GROUP);
  });
});

describe("tagEmoji", () => {
  it("uses the glyph listed for a slug", () => {
    expect(tagEmoji(ROMANCE)).toBe("💗");
  });

  it("falls back to the kind for a slug nobody listed", () => {
    expect(tagEmoji(tag({ id: 99, name: "Roommates", kind: "trope" }))).toBe(
      "💫",
    );
  });

  it("follows the slug rather than the name, so a rename keeps its glyph", () => {
    expect(tagEmoji({ slug: "sci-fi", kind: "genre" })).toBe("🚀");
  });
});
