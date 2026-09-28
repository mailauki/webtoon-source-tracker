import { describe, expect, it } from "vitest";

import {
  ALL,
  resolveActiveChip,
  resolvePublication,
} from "@/lib/data/library-prefs";

/**
 * The stored value has three states that must not collapse into each other:
 * null (never chose), `all` (explicitly chose everything), and a slug.
 */
describe("resolveActiveChip", () => {
  it("treats a missing preference as the All chip", () => {
    expect(resolveActiveChip(null)).toBe("");
    expect(resolveActiveChip(undefined)).toBe("");
  });

  it("treats an explicit 'all' as the All chip", () => {
    expect(resolveActiveChip(ALL)).toBe("");
  });

  it("passes a real selection through", () => {
    expect(resolveActiveChip("reading")).toBe("reading");
  });

  // 'none' is a real source value (titles with no source recorded). It must
  // never be mistaken for "no preference".
  it("passes the 'none' source through rather than clearing it", () => {
    expect(resolveActiveChip("none")).toBe("none");
  });
});

describe("resolvePublication", () => {
  it("keeps a stored side", () => {
    expect(resolvePublication("ongoing")).toBe("ongoing");
    expect(resolvePublication("completed")).toBe("completed");
  });

  // Never chose, chose All, and a value some other version wrote all show the
  // whole shelf rather than an unexplained empty one.
  it("reads anything else as All", () => {
    expect(resolvePublication(null)).toBe("");
    expect(resolvePublication(undefined)).toBe("");
    expect(resolvePublication("all")).toBe("");
    expect(resolvePublication("upcoming")).toBe("");
  });
});
