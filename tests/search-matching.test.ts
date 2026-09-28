import { describe, expect, it } from "vitest";

import {
  collectAltTitles,
  DEFAULT_MEDIA_KIND,
  isNovel,
  matchesMediaKind,
  matchesTitle,
  normalizeTitle,
  resolveMediaKind,
  titleMatchScore,
} from "@/lib/data/search";

/**
 * The pure half of searching: what a term matches, and which side of the
 * novels/webtoons switch a title falls on.
 *
 * Worth its own file because both the browser and the MAL route handler call
 * these, and a disagreement between them is invisible in either place on its
 * own — the catalog would answer with one half of the catalog while the shelf
 * above it showed the other.
 */

describe("matchesTitle", () => {
  const titles = { title: "Solo Leveling", title_en: "Only I Level Up" };

  it("matches the romanised title", () => {
    expect(matchesTitle(titles, "solo")).toBe(true);
  });

  it("matches the English title as well", () => {
    // The card shows one title; the user may only know the other.
    expect(matchesTitle(titles, "level up")).toBe(true);
  });

  it("matches anywhere in the title, not just the start", () => {
    expect(matchesTitle(titles, "leveling")).toBe(true);
  });

  it("does not match a term that is in neither", () => {
    expect(matchesTitle(titles, "tower")).toBe(false);
  });

  it("survives a row with no titles at all", () => {
    expect(matchesTitle(null, "solo")).toBe(false);
    expect(matchesTitle({ title: null, title_en: null }, "solo")).toBe(false);
  });
});

describe("matching alternate titles", () => {
  const titles = {
    title: "Ore dake Level Up na Ken",
    title_en: "Solo Leveling",
    alt_titles: ["Na Honjaman Level Up", "나 혼자만 레벨업"],
  };

  it("finds a title by a synonym", () => {
    expect(matchesTitle(titles, "honjaman")).toBe(true);
  });

  it("finds a title by its native-script name", () => {
    expect(matchesTitle(titles, "혼자만")).toBe(true);
  });

  it("still works for a row with no alternate titles", () => {
    expect(matchesTitle({ title: "Omniscient Reader" }, "reader")).toBe(true);
    expect(
      matchesTitle({ title: "Omniscient Reader", alt_titles: null }, "reader"),
    ).toBe(true);
  });
});

describe("loosened matching", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeTitle("Re:ZERO — Starting Life")).toBe(
      "re zero starting life",
    );
    expect(matchesTitle({ title: "Re:Zero" }, "re zero")).toBe(true);
    expect(matchesTitle({ title: "Pokémon Adventures" }, "pokemon")).toBe(true);
    expect(matchesTitle({ title: "Kaguya-sama" }, "KAGUYA SAMA")).toBe(true);
  });

  it("ignores spacing", () => {
    expect(matchesTitle({ title: "Re:Zero" }, "rezero")).toBe(true);
    expect(matchesTitle({ title: "OnePunch-Man" }, "one punch")).toBe(true);
  });

  it("tolerates a typo in a longer term", () => {
    expect(matchesTitle({ title: "Solo Leveling" }, "solo leveing")).toBe(true);
    // A swapped pair of letters counts as one edit, not two.
    expect(matchesTitle({ title: "Solo Leveling" }, "levleing")).toBe(true);
  });

  it("tolerates two typos only in a long term", () => {
    expect(matchesTitle({ title: "Omniscient Reader" }, "omnisient readr")).toBe(
      true,
    );
    expect(matchesTitle({ title: "Solo Leveling" }, "slo lveling")).toBe(true);
    expect(matchesTitle({ title: "Tower of God" }, "twr f")).toBe(false);
  });

  it("does not guess at short terms", () => {
    // One edit from "tower" is one edit from far too much.
    expect(matchesTitle({ title: "Tower of God" }, "towr")).toBe(false);
    expect(matchesTitle({ title: "Tower of God" }, "towe")).toBe(true);
  });

  it("does not match something merely similar in length", () => {
    expect(matchesTitle({ title: "Solo Leveling" }, "tower of god")).toBe(false);
  });

  it("ranks exact over spacing over typo", () => {
    expect(titleMatchScore({ title: "Re:Zero" }, "re zero")).toBe(0);
    expect(titleMatchScore({ title: "Re:Zero" }, "rezero")).toBe(1);
    expect(titleMatchScore({ title: "Solo Leveling" }, "solo leveing")).toBe(3);
    expect(titleMatchScore({ title: "Solo Leveling" }, "tower")).toBeNull();
  });

  it("matches nothing for a term that is only punctuation", () => {
    expect(matchesTitle({ title: "Re:Zero" }, " : ")).toBe(false);
  });
});

// The typo pass skips titles that cannot be within the limit, judged by
// shared character pairs (see sharesEnoughPairs). That shortcut is only
// allowed to save work, never to change an answer, so this throws a few
// hundred random typos — swaps, insertions, deletions, substitutions — at
// terms cut from real-looking titles and checks each is still found.
describe("typo matching never misses a real match", () => {
  const TITLES = [
    "Contract Marriage with the Second Lead",
    "The Villainess Reverses the Hourglass",
    "Omniscient Reader's Viewpoint",
    "Seobeu Namjunim, Gyeyak Gyeolhon-iramyeonseoyo?",
    "나 혼자만 레벨업",
    "I Became the Tyrant's Secretary",
  ];

  // Seeded, so a failure reproduces.
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const int = (n: number) => Math.floor(random() * n);

  /** One typo at a position in [from, to) of `chars`. */
  function applyTypo(chars: string[], from = 0, to = chars.length): string[] {
    const next = [...chars];
    const i = from + int(Math.max(1, to - from));
    const letter = "abcdefghijklmnopqrstuvwxyz"[int(26)];
    switch (int(4)) {
      case 0:
        next[i] = letter;
        break;
      case 1:
        next.splice(i, 0, letter);
        break;
      case 2:
        if (next.length > 1) next.splice(i, 1);
        break;
      default:
        if (i + 1 < next.length) [next[i], next[i + 1]] = [next[i + 1], next[i]];
    }
    return next;
  }

  it("finds every term within its typo limit", () => {
    let checked = 0;
    for (let run = 0; run < 400; run++) {
      const title = TITLES[int(TITLES.length)];
      const compact = Array.from(normalizeTitle(title).replaceAll(" ", ""));
      const length = Math.min(compact.length, 5 + int(20));
      const start = int(compact.length - length + 1);
      let term = compact.slice(start, start + length);

      // The matcher allows one typo from five characters and two from nine,
      // counted on the term as typed — after the typos, which can shorten
      // it. A case whose typos took it below its own allowance is one the
      // matcher is right not to find, so it is skipped rather than asserted.
      // Two typos go in separate halves of the term, as real typos do. Two
      // stacked on one spot — a letter deleted and its new neighbours then
      // swapped — count as three edits to the optimal-string-alignment
      // distance the matcher uses, a known limit it accepts rather than the
      // cost of full Damerau-Levenshtein on every keystroke.
      const typos = term.length >= 9 ? 2 : 1;
      if (typos === 1) {
        term = applyTypo(term);
      } else {
        const half = Math.floor(term.length / 2);
        term = applyTypo(term, 0, half - 2);
        term = applyTypo(term, half + 1, term.length);
      }
      const allowed = term.length >= 9 ? 2 : term.length >= 5 ? 1 : 0;
      if (typos > allowed) continue;
      checked++;

      expect(
        matchesTitle({ title }, term.join("")),
        `${JSON.stringify(term.join(""))} in ${JSON.stringify(title)}`,
      ).toBe(true);
    }
    // Most cases must actually be checked, or the skip above hides a bug.
    expect(checked).toBeGreaterThan(300);
  });
});

describe("collectAltTitles", () => {
  it("keeps names that are not already displayed, once each", () => {
    expect(
      collectAltTitles(
        ["Solo Leveling", null],
        ["solo leveling!", "Na Honjaman Level Up", "", null, "Na Honjaman Level Up"],
      ),
    ).toEqual(["Na Honjaman Level Up"]);
  });

  it("trims what it keeps", () => {
    expect(collectAltTitles(["A"], ["  나 혼자만 레벨업 "])).toEqual([
      "나 혼자만 레벨업",
    ]);
  });
});

describe("the novels/webtoons switch", () => {
  it("counts both of MAL's prose kinds as novels", () => {
    expect(isNovel("novel")).toBe(true);
    expect(isNovel("light_novel")).toBe(true);
  });

  it("counts everything with panels as not a novel", () => {
    for (const kind of ["manga", "manhwa", "manhua", "one_shot", "doujinshi"]) {
      expect(isNovel(kind)).toBe(false);
    }
  });

  // A row that never got a kind synced must not fall off both sides of a
  // switch that has no "all" — it stays with the default one.
  it("treats an unknown or missing kind as not a novel", () => {
    expect(isNovel(null)).toBe(false);
    expect(isNovel(undefined)).toBe(false);
    expect(isNovel("oel")).toBe(false);
    expect(matchesMediaKind(null, DEFAULT_MEDIA_KIND)).toBe(true);
  });

  it("puts every title on exactly one side", () => {
    for (const kind of ["manga", "light_novel", null]) {
      const sides = [
        matchesMediaKind(kind, "webtoons"),
        matchesMediaKind(kind, "novels"),
      ].filter(Boolean);
      expect(sides).toHaveLength(1);
    }
  });
});

describe("resolveMediaKind", () => {
  it("keeps a stored side", () => {
    expect(resolveMediaKind("novels")).toBe("novels");
    expect(resolveMediaKind("webtoons")).toBe("webtoons");
  });

  // A preference written by a version that offered a side this one dropped
  // should quietly fall back rather than throw on render.
  it("falls back to the default for anything else", () => {
    expect(resolveMediaKind(null)).toBe(DEFAULT_MEDIA_KIND);
    expect(resolveMediaKind(undefined)).toBe(DEFAULT_MEDIA_KIND);
    expect(resolveMediaKind("")).toBe(DEFAULT_MEDIA_KIND);
    expect(resolveMediaKind("audiobooks")).toBe(DEFAULT_MEDIA_KIND);
  });
});
