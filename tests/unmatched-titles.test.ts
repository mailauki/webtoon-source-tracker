import { describe, expect, it } from "vitest";

import { parseUnmatchedTitles } from "@/lib/sync/unmatched-titles";

describe("parseUnmatchedTitles", () => {
  it("keeps well-formed rows", () => {
    const rows = [{ onlyOn: "mal", id: 3, title: "Solo Leveling" }];
    expect(parseUnmatchedTitles(rows)).toEqual(rows);
  });

  // A row from before the column existed, or a shape this code no longer
  // writes, must not take the settings page down with it.
  it("reads anything else as an empty list", () => {
    expect(parseUnmatchedTitles(undefined)).toEqual([]);
    expect(parseUnmatchedTitles(null)).toEqual([]);
    expect(parseUnmatchedTitles([{ onlyOn: "kitsu", id: 1, title: "x" }])).toEqual([]);
  });
});
