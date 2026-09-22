import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isExplicitName, kindForMalGenre } from "@/lib/data/mal-taxonomy";
import { isExplicitKind, KIND_LABELS, TAG_KINDS } from "@/lib/data/tag-items";

describe("kindForMalGenre", () => {
  // MAL sends a flat `genres` array with no group, so this table is the
  // missing half of the payload — transcribed from MAL's own advanced-search
  // filters.

  it("puts the explicit genres in their own kind", () => {
    for (const name of ["Ecchi", "Erotica", "Hentai"]) {
      expect(kindForMalGenre(name)).toBe("explicit");
    }
  });

  it("separates demographics from genres", () => {
    for (const name of ["Josei", "Kids", "Seinen", "Shoujo", "Shounen"]) {
      expect(kindForMalGenre(name)).toBe("demographic");
    }
  });

  it("separates themes from genres", () => {
    expect(kindForMalGenre("Isekai")).toBe("theme");
    expect(kindForMalGenre("Villainess")).toBe("theme");
    expect(kindForMalGenre("Time Travel")).toBe("theme");
  });

  it("leaves the actual genres as genres", () => {
    for (const name of ["Action", "Romance", "Sci-Fi", "Boys Love"]) {
      expect(kindForMalGenre(name)).toBe("genre");
    }
  });

  it("falls back to genre for a group MAL adds later", () => {
    // The old behaviour, which is the right thing to degrade to: a new name
    // should land where every name used to, not fail the sync.
    expect(kindForMalGenre("Some New Group")).toBe("genre");
  });

  it("matches on slug, so a renamed tag keeps its kind", () => {
    expect(kindForMalGenre("sci-fi")).toBe("genre");
    expect(kindForMalGenre("ECCHI")).toBe("explicit");
    expect(kindForMalGenre("Idols (Female)")).toBe("theme");
  });
});

describe("isExplicitName", () => {
  it("is true for exactly the explicit group", () => {
    expect(isExplicitName("Hentai")).toBe(true);
    expect(isExplicitName("Ecchi")).toBe(true);
    expect(isExplicitName("Romance")).toBe(false);
    expect(isExplicitName("Shounen")).toBe(false);
  });

  it("agrees with isExplicitKind", () => {
    expect(isExplicitKind(kindForMalGenre("Erotica"))).toBe(true);
    expect(isExplicitKind(kindForMalGenre("Action"))).toBe(false);
  });
});

describe("the kinds themselves", () => {
  it("labels every kind, so no heading can render undefined", () => {
    for (const kind of TAG_KINDS) {
      expect(KIND_LABELS[kind]).toBeTruthy();
    }
  });

  it("orders explicit last", () => {
    expect(TAG_KINDS[TAG_KINDS.length - 1]).toBe("explicit");
  });
});

describe("the backfill script's inlined copy", () => {
  // scripts/backfill-genres.ts cannot import lib/ under
  // `node --experimental-strip-types`, so it carries its own copy of the
  // table. Two copies drift; this is what notices.
  const script = readFileSync("scripts/backfill-genres.ts", "utf8");

  const inlined = (name: string) => {
    const m = script.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`, "s"));
    if (!m) throw new Error(`${name} not found in the script`);
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
  };

  it("classifies the explicit genres identically", () => {
    expect(inlined("EXPLICIT")).toEqual(["ecchi", "erotica", "hentai"]);
    for (const slug of inlined("EXPLICIT")) {
      expect(kindForMalGenre(slug)).toBe("explicit");
    }
  });

  it("classifies demographics identically", () => {
    for (const slug of inlined("DEMOGRAPHIC")) {
      expect(kindForMalGenre(slug)).toBe("demographic");
    }
  });

  it("classifies themes identically", () => {
    for (const slug of inlined("THEME")) {
      expect(kindForMalGenre(slug)).toBe("theme");
    }
  });
});
