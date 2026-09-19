import { describe, expect, it } from "vitest";

import { displayTitle, secondaryTitle } from "@/lib/data/display-title";

describe("displayTitle", () => {
  it("prefers the English name", () => {
    expect(
      displayTitle({ title: "Na Honjaman Level Up", title_en: "Solo Leveling" }),
    ).toBe("Solo Leveling");
  });

  it("falls back when MAL has no English name", () => {
    expect(displayTitle({ title: "Berserk", title_en: null })).toBe("Berserk");
  });

  // MAL returns "" rather than omitting the field for a good share of its
  // catalog, and rows written before add-entry's `|| null` still hold it.
  it("treats an empty English name as absent", () => {
    expect(displayTitle({ title: "Berserk", title_en: "" })).toBe("Berserk");
    expect(displayTitle({ title: "Berserk", title_en: "   " })).toBe("Berserk");
  });

  it("trims a padded English name", () => {
    expect(displayTitle({ title: "X", title_en: "  Solo Leveling " })).toBe(
      "Solo Leveling",
    );
  });
});

describe("secondaryTitle", () => {
  it("offers the canonical name when it differs", () => {
    expect(
      secondaryTitle({
        title: "Na Honjaman Level Up",
        title_en: "Solo Leveling",
      }),
    ).toBe("Na Honjaman Level Up");
  });

  it("says nothing when there is no English name", () => {
    expect(secondaryTitle({ title: "Berserk", title_en: null })).toBeNull();
  });

  // Published in English under its original name: one line, not two.
  it("says nothing when the two names match", () => {
    expect(secondaryTitle({ title: "Berserk", title_en: "Berserk" })).toBeNull();
  });

  it("does not repeat the heading after trimming", () => {
    expect(
      secondaryTitle({ title: "Berserk", title_en: "  Berserk  " }),
    ).toBeNull();
  });
});
