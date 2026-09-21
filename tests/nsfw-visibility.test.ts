import { describe, expect, it } from "vitest";

import { isMature, MATURE_RATINGS, screenMature } from "@/lib/data/nsfw";

describe("isMature", () => {
  it("treats MAL's gray and black as adult", () => {
    expect(isMature({ nsfw: "gray" })).toBe(true);
    expect(isMature({ nsfw: "black" })).toBe(true);
  });

  it("treats white as safe", () => {
    expect(isMature({ nsfw: "white" })).toBe(false);
  });

  it("treats an unrated title as safe, not as adult", () => {
    // The catalog is null for every row the backfill has not reached, so the
    // cautious-looking direction would empty a shelf rather than clean it.
    expect(isMature({ nsfw: null })).toBe(false);
    expect(isMature({ nsfw: undefined })).toBe(false);
    expect(isMature({})).toBe(false);
    expect(isMature(null)).toBe(false);
    expect(isMature(undefined)).toBe(false);
  });

  it("treats a rating it has never heard of as safe", () => {
    expect(isMature({ nsfw: "something-new" })).toBe(false);
  });

  it("draws the line in exactly one place", () => {
    expect([...MATURE_RATINGS].sort()).toEqual(["black", "gray"]);
  });
});

describe("screenMature", () => {
  const rows = [
    { id: 1, media_titles: { nsfw: "white" } },
    { id: 2, media_titles: { nsfw: "gray" } },
    { id: 3, media_titles: { nsfw: null } },
    { id: 4, media_titles: { nsfw: "black" } },
  ];

  it("returns the rows untouched when the switch is off", () => {
    expect(screenMature(rows, false, (r) => r.media_titles)).toBe(rows);
  });

  it("drops only the adult rows when the switch is on", () => {
    const kept = screenMature(rows, true, (r) => r.media_titles);
    expect(kept.map((r) => r.id)).toEqual([1, 3]);
  });

  it("does not mutate what it was given", () => {
    screenMature(rows, true, (r) => r.media_titles);
    expect(rows).toHaveLength(4);
  });

  it("reads the rating through the accessor, whatever the row shape", () => {
    const titles = [{ nsfw: "black" }, { nsfw: "white" }];
    expect(screenMature(titles, true, (t) => t)).toEqual([{ nsfw: "white" }]);
  });

  it("keeps a row whose title is missing entirely", () => {
    // An inner join should already have dropped it; if one ever arrives, the
    // switch is not the thing that should decide it does not exist.
    const orphans = [{ id: 1, media_titles: null }];
    expect(screenMature(orphans, true, (r) => r.media_titles)).toHaveLength(1);
  });
});
