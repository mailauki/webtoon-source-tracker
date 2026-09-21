import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CategoryGrid } from "@/components/discover/category-grid";
import { tagEmoji } from "@/lib/data/tag-emoji";
import { groupByKind, slugify, type Tag } from "@/lib/data/tag-items";

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

afterEach(cleanup);

describe("<CategoryGrid>", () => {
  it("links every pill to that tag's page", () => {
    render(<CategoryGrid groups={groupByKind([ROMANCE, WEBTOON])} />);

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
    render(<CategoryGrid groups={groupByKind([WEBTOON, ROMANCE, REGRESSION])} />);

    const kinds = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    // TAG_KINDS order, not the order they were handed over.
    expect(kinds).toEqual(["Genres", "Tropes", "Formats"]);
  });

  it("puts each tag under its own kind", () => {
    render(<CategoryGrid groups={groupByKind([ROMANCE, FANTASY, WEBTOON])} />);

    const [genres, formats] = screen.getAllByRole("list");
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

  it("shows every category in a group — nothing is held back", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      tag({ id: 100 + i, name: `Genre ${i + 1}` }),
    );
    render(<CategoryGrid groups={groupByKind(many)} />);

    expect(screen.getAllByRole("link")).toHaveLength(40);
  });

  it("keeps the glyph out of the link's accessible name", () => {
    render(<CategoryGrid groups={groupByKind([ROMANCE])} />);

    // It is rendered, but aria-hidden, so the link is named by the tag alone.
    const link = screen.getByRole("link", { name: "Romance" });
    expect(link).toHaveTextContent(tagEmoji(ROMANCE));
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
