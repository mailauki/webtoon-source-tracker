import { describe, expect, it } from "vitest";

import { groupByKind, slugify, sortTags, type Tag } from "@/lib/data/tag-items";

const tag = (over: Partial<Tag> & { id: number; name: string }): Tag => ({
  slug: slugify(over.name),
  description: null,
  kind: "trope",
  mal_genre_id: null,
  sort_order: 100,
  is_active: true,
  ...over,
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Enemies to Lovers")).toBe("enemies-to-lovers");
  });

  it("strips punctuation rather than encoding it", () => {
    expect(slugify("Sci-Fi & Fantasy!")).toBe("sci-fi-fantasy");
  });

  it("collapses runs of separators and trims them from the ends", () => {
    expect(slugify("  Boys'  Love  ")).toBe("boys-love");
  });

  it("keeps digits", () => {
    expect(slugify("Isekai 2")).toBe("isekai-2");
  });
});

describe("sortTags", () => {
  it("orders by sort_order, then name", () => {
    const sorted = sortTags([
      tag({ id: 1, name: "Romance", sort_order: 100 }),
      tag({ id: 2, name: "Action", sort_order: 100 }),
      tag({ id: 3, name: "Zombie", sort_order: 10 }),
    ]);
    expect(sorted.map((t) => t.name)).toEqual(["Zombie", "Action", "Romance"]);
  });

  it("does not mutate its argument", () => {
    const input = [
      tag({ id: 1, name: "B" }),
      tag({ id: 2, name: "A" }),
    ];
    sortTags(input);
    expect(input.map((t) => t.name)).toEqual(["B", "A"]);
  });
});

describe("groupByKind", () => {
  it("returns genres before tropes, and omits kinds with no tags", () => {
    const groups = groupByKind([
      tag({ id: 1, name: "Enemies to Lovers", kind: "trope" }),
      tag({ id: 2, name: "Romance", kind: "genre" }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["genre", "trope"]);
    expect(groups[0].tags.map((t) => t.name)).toEqual(["Romance"]);
  });

  it("sorts within each group", () => {
    const groups = groupByKind([
      tag({ id: 1, name: "Romance", kind: "genre" }),
      tag({ id: 2, name: "Action", kind: "genre" }),
    ]);
    expect(groups[0].tags.map((t) => t.name)).toEqual(["Action", "Romance"]);
  });
});
