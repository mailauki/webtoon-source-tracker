import { describe, expect, it } from "vitest";

import type { AniListMediaExtras } from "@/lib/anilist/types";
import {
  authorWorks,
  isAuthorRole,
  mergeAuthors,
  nameKey,
  relatedWorks,
  type LibraryMatch,
} from "@/lib/data/author-works";

type Staff = NonNullable<AniListMediaExtras["staff"]>;

function media(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    idMal: id + 1000,
    title: { romaji: `Romaji ${id}`, english: null },
    format: "MANGA",
    isAdult: false,
    coverImage: { large: `https://img/${id}.jpg`, medium: null },
    ...extra,
  };
}

function edge(
  role: string,
  id: number,
  name: string | { full: string; native?: string; alternative?: string[] },
  works?: ReturnType<typeof media>[],
) {
  return {
    role,
    node: {
      id,
      name: typeof name === "string" ? { full: name } : name,
      siteUrl: `https://anilist.co/staff/${id}`,
      ...(works ? { staffMedia: { nodes: works } } : {}),
    },
  };
}

const staff: Staff = {
  edges: [
    edge("Story", 10, "Writer", [media(1), media(2), media(3)]),
    edge("Art", 20, "Artist", [media(1), media(3), media(4)]),
    // The writer again, under a second credit.
    edge("Original Creator", 10, "Writer", [media(5)]),
    edge("Translator (English)", 30, "Translator", [media(6)]),
    edge("Touch-up Art & Lettering", 40, "Letterer", [media(7)]),
  ],
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

describe("nameKey", () => {
  it("ignores case, accents, punctuation and word order", () => {
    expect(nameKey("Sung-Lak Jang")).toBe(nameKey("JANG, Sunglak"));
    expect(nameKey("Éiichirō Oda")).toBe(nameKey("oda eiichiro"));
    expect(nameKey("Chugong")).not.toBe(nameKey("Chu Gong Two"));
  });
});

describe("mergeAuthors", () => {
  it("lines MAL's authors up with AniList's by any of AniList's names", () => {
    const { authors, mismatches } = mergeAuthors(
      [
        { id: 1, name: "Chugong", role: "Story" },
        { id: 2, name: "Sung-Lak Jang", role: "Art" },
      ],
      {
        edges: [
          edge("Original Creator", 10, "Chugong"),
          // Matched on an alternative spelling, and on word order.
          edge("Art", 20, { full: "Seong-Rak Jang", native: "장성락", alternative: ["Jang Sung-Lak"] }),
        ],
      },
    );

    expect(authors.map((a) => [a.name, a.mal?.id, a.anilist?.id])).toEqual([
      ["Chugong", 1, 10],
      ["Sung-Lak Jang", 2, 20],
    ]);
    expect(authors[0].mal?.url).toBe("https://myanimelist.net/people/1");
    // "Original Creator" is AniList's word for the writer: no disagreement.
    expect(mismatches).toEqual([]);
  });

  it("folds one person's separate credits on either site", () => {
    const { authors, mismatches } = mergeAuthors(
      [
        { id: 1, name: "Solo Author", role: "Story" },
        { id: 1, name: "Solo Author", role: "Art" },
      ],
      { edges: [edge("Story & Art", 10, "Solo Author")] },
    );
    expect(authors).toHaveLength(1);
    expect(authors[0].roles).toEqual(["Story", "Art"]);
    expect(mismatches).toEqual([]);
  });

  it("reports an author only one site credits, and a role they disagree on", () => {
    const { authors, mismatches } = mergeAuthors(
      [
        { id: 1, name: "Writer", role: "Story & Art" },
        { id: 2, name: "Only On Mal", role: "Art" },
      ],
      {
        edges: [
          edge("Story", 10, "Writer"),
          edge("Art", 30, "Only On AniList"),
          edge("Translator (English)", 40, "Not An Author"),
        ],
      },
    );

    expect(authors.map((a) => a.key)).toEqual(["mal:1", "mal:2", "anilist:30"]);
    expect(mismatches).toEqual([
      { kind: "roles", name: "Writer", mal: "Story & Art", anilist: "Story" },
      { kind: "missing", name: "Only On Mal", creditedBy: "mal" },
      { kind: "missing", name: "Only On AniList", creditedBy: "anilist" },
    ]);
  });

  it("reports nothing when only one site answered", () => {
    const fromMal = mergeAuthors([{ id: 1, name: "Writer", role: "Story" }], null);
    expect(fromMal.authors).toHaveLength(1);
    expect(fromMal.mismatches).toEqual([]);

    const fromAniList = mergeAuthors(null, { edges: [edge("Story", 10, "Writer")] });
    expect(fromAniList.authors.map((a) => a.anilist?.id)).toEqual([10]);
    expect(fromAniList.mismatches).toEqual([]);
  });
});

describe("authorWorks", () => {
  const works = authorWorks({ id: 1, staff });

  it("dedupes works across authors, leaves the title out, and skips non-authors", () => {
    expect(works.map((work) => work.anilistId)).toEqual([2, 3, 4, 5]);
  });

  it("prefers the English title, falling back to romaji", () => {
    const named = authorWorks({
      id: 1,
      staff: { edges: [edge("Story", 10, "W", [media(2, { title: { romaji: "R", english: "E" } }), media(3)])] },
    });
    expect(named.map((work) => work.title)).toEqual(["E", "Romaji 3"]);
  });

  it("is empty when AniList had nothing to say, or was not asked for works", () => {
    expect(authorWorks(null)).toEqual([]);
    expect(authorWorks({ id: 1, staff: null })).toEqual([]);
    expect(authorWorks({ id: 1, staff: { edges: [edge("Story", 10, "W")] } })).toEqual([]);
  });
});

describe("relatedWorks", () => {
  const works = authorWorks({ id: 1, staff });
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
    const mixed = authorWorks({
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
