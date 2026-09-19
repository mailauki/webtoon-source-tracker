import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEDIA_KIND,
  isNovel,
  matchesMediaKind,
  matchesTitle,
  resolveMediaKind,
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
