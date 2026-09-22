import { describe, expect, it } from "vitest";

import {
  AGE_RANGES,
  ageRangeLabel,
  hasDeclaredAge,
  isAdult,
  parseAgeRange,
  rangeFromBounds,
} from "@/lib/data/age";

describe("isAdult", () => {
  it("is true only for the top bracket", () => {
    expect(isAdult("18_or_over")).toBe(true);
    expect(isAdult("16_to_17")).toBe(false);
    expect(isAdult("13_to_15")).toBe(false);
    expect(isAdult("under_13")).toBe(false);
  });

  it("is false for an account that has never confirmed", () => {
    // The unanswered case has to fall on the same side as "no", or skipping
    // the confirmation would be strictly better than answering it honestly.
    expect(isAdult(null)).toBe(false);
    expect(isAdult(undefined)).toBe(false);
    expect(isAdult("")).toBe(false);
  });

  it("is false for a bracket this version does not recognise", () => {
    expect(isAdult("21_or_over")).toBe(false);
  });
});

describe("hasDeclaredAge", () => {
  it("accepts every listed bracket", () => {
    for (const range of AGE_RANGES) {
      expect(hasDeclaredAge(range.value)).toBe(true);
    }
  });

  it("rejects nothing-at-all and anything unlisted", () => {
    expect(hasDeclaredAge(null)).toBe(false);
    expect(hasDeclaredAge("")).toBe(false);
    expect(hasDeclaredAge("adult")).toBe(false);
  });

  it("is not the same question as isAdult", () => {
    // A confirmed sixteen-year-old has declared an age and is not an adult.
    expect(hasDeclaredAge("16_to_17")).toBe(true);
    expect(isAdult("16_to_17")).toBe(false);
  });
});

describe("parseAgeRange / ageRangeLabel", () => {
  it("narrows a stored value back to the union", () => {
    expect(parseAgeRange("18_or_over")).toBe("18_or_over");
    expect(parseAgeRange("nonsense")).toBeNull();
    expect(parseAgeRange(null)).toBeNull();
  });

  it("labels a stored bracket, and nothing else", () => {
    expect(ageRangeLabel("13_to_15")).toBe("13 to 15");
    expect(ageRangeLabel("nonsense")).toBeNull();
    expect(ageRangeLabel(null)).toBeNull();
  });
});

describe("rangeFromBounds", () => {
  // The seam a native platform signal would land on. Nothing calls it yet —
  // Apple's and Google's APIs are native SDKs a browser cannot reach — so
  // these tests are what keep the mapping honest until something does.

  it("maps a lower bound onto the bracket it entitles", () => {
    expect(rangeFromBounds(18)).toBe("18_or_over");
    expect(rangeFromBounds(21)).toBe("18_or_over");
    expect(rangeFromBounds(16)).toBe("16_to_17");
    expect(rangeFromBounds(13)).toBe("13_to_15");
    expect(rangeFromBounds(9)).toBe("under_13");
    expect(rangeFromBounds(0)).toBe("under_13");
  });

  it("reads the lower bound alone, so an open-ended range still resolves", () => {
    // "18 and up, no upper bound" and "18 to 24" are the same entitlement.
    expect(rangeFromBounds(18)).toBe("18_or_over");
  });

  it("treats an absent bound as unknown, not as a child", () => {
    // "We could not tell you" is not "they are under 13"; null lets the
    // caller fall back to asking rather than recording a wrong bracket.
    expect(rangeFromBounds(null)).toBeNull();
    expect(rangeFromBounds(undefined)).toBeNull();
  });

  it("rejects a bound that is not a usable number", () => {
    expect(rangeFromBounds(Number.NaN)).toBeNull();
    expect(rangeFromBounds(Number.POSITIVE_INFINITY)).toBeNull();
    expect(rangeFromBounds(-1)).toBeNull();
  });
});
