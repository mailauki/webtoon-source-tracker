import { describe, expect, it } from "vitest";

import type { AniListMediaStaff } from "@/lib/anilist/types";
import {
  authorWorks,
  isAuthorRole,
  relatedWorks,
  type LibraryMatch,
} from "@/lib/data/author-works";

function media(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    idMal: id + 1000,
    title: { romaji: `Romaji ${id}`, english: null },
    format: "MANGA",
    isAdult: false,
    siteUrl: `https://anilist.co/manga/${id}`,
    coverImage: { large: `https://img/${id}.jpg`, medium: null },
    ...extra,
  };
}

function edge(role: string, id: number, name: string, works: ReturnType<typeof media>[]) {
  return {
    role,
    node: {
      id,
      name: { full: name },
      siteUrl: `https://anilist.co/staff/${id}`,
      staffMedia: { nodes: works },
    },
  };
}

const staff: AniListMediaStaff = {
  id: 1,
  staff: {
    edges: [
      edge("Story", 10, "Writer", [media(1), media(2), media(3)]),
      edge("Art", 20, "Artist", [media(1), media(3), media(4)]),
      // The writer again, under a second credit.
      edge("Original Creator", 10, "Writer", [media(5)]),
      edge("Translator (English)", 30, "Translator", [media(6)]),
      edge("Touch-up Art & Lettering", 40, "Letterer", [media(7)]),
    ],
  },
};

describe("isAuthorRole", () => {
  it("counts the credits that made the title", () => {
    for (const role of ["Story", "Art", "Story & Art", "Original Creator", "Art (ch 1-40)", "Illustration"]) {
      expect(isAuthorRole(role)).toBe(true);
    }
  });

  it("leaves out translation, lettering and assistance", () => {
    for (const role of ["Translator (English)", "Lettering", "Touch-up Art & Lettering", "Assistant", null, ""]) {
      expect(isAuthorRole(role)).toBe(false);
    }
  });
});

describe("authorWorks", () => {
  const { authors, works } = authorWorks(staff);

  it("folds a person with two credits into one author, and drops non-authors", () => {
    expect(authors).toEqual([
      { id: 10, name: "Writer", url: "https://anilist.co/staff/10", roles: ["Story", "Original Creator"] },
      { id: 20, name: "Artist", url: "https://anilist.co/staff/20", roles: ["Art"] },
    ]);
  });

  it("dedupes works across authors and leaves the title itself out", () => {
    expect(works.map((work) => work.anilistId)).toEqual([2, 3, 4, 5]);
    expect(works.find((work) => work.anilistId === 3)?.authorIds).toEqual([10, 20]);
  });

  it("prefers the English title, falling back to romaji", () => {
    const { works: named } = authorWorks({
      id: 1,
      staff: { edges: [edge("Story", 10, "W", [media(2, { title: { romaji: "R", english: "E" } }), media(3)])] },
    });
    expect(named.map((work) => work.title)).toEqual(["E", "Romaji 3"]);
  });

  it("is empty when AniList had nothing to say", () => {
    expect(authorWorks(null)).toEqual({ authors: [], works: [] });
    expect(authorWorks({ id: 1, staff: null })).toEqual({ authors: [], works: [] });
  });
});

describe("relatedWorks", () => {
  const { works } = authorWorks(staff);
  const library: LibraryMatch[] = [
    // Matched by MAL id alone: synced from MyAnimeList, no AniList id yet.
    { entryId: 44, anilistMediaId: null, malMediaId: 1004, title: "Shelf name", cover: null },
    { entryId: 55, anilistMediaId: 5, malMediaId: null, title: "Five", cover: "https://mine/5.jpg" },
  ];

  it("links tracked works to their entries, and lists them first", () => {
    const related = relatedWorks(works, library, { hideMature: false });
    expect(related.map((work) => [work.anilistId, work.entryId])).toEqual([
      [4, 44],
      [5, 55],
      [2, null],
      [3, null],
    ]);
  });

  it("shows a tracked work under the reader's own name and cover", () => {
    const [four, five] = relatedWorks(works, library, { hideMature: false });
    expect(four).toMatchObject({ title: "Shelf name", cover: "https://img/4.jpg" });
    expect(five).toMatchObject({ title: "Five", cover: "https://mine/5.jpg" });
  });

  it("drops adult works when the reader hides them", () => {
    const { works: mixed } = authorWorks({
      id: 1,
      staff: { edges: [edge("Story", 10, "W", [media(2, { isAdult: true }), media(3)])] },
    });
    expect(relatedWorks(mixed, [], { hideMature: true }).map((w) => w.anilistId)).toEqual([3]);
    expect(relatedWorks(mixed, [], { hideMature: false })).toHaveLength(2);
  });

  it("caps the list", () => {
    expect(relatedWorks(works, [], { hideMature: false, limit: 2 })).toHaveLength(2);
  });
});
