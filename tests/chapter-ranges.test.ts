import { describe, expect, it } from "vitest";

import {
  countChapters,
  highestOwned,
  stepHighest,
  formatRanges,
  formatRangesForInput,
  fromMultirange,
  gapsWithin,
  normalizeRanges,
  parseRanges,
  toMultirange,
  unionRanges,
  type ChapterRange,
} from "@/lib/data/chapter-ranges";

const r = (start: number, end = start): ChapterRange => ({ start, end });

describe("normalizeRanges", () => {
  it("sorts out-of-order ranges", () => {
    expect(normalizeRanges([r(55), r(1, 40)])).toEqual([r(1, 40), r(55)]);
  });

  it("merges overlapping ranges", () => {
    expect(normalizeRanges([r(1, 40), r(30, 50)])).toEqual([r(1, 50)]);
  });

  // Chapters are discrete: nothing sits between 40 and 41, so the two runs are
  // one. Postgres does the same to a stored multirange, and a mismatch here
  // would make every save look like it rewrote itself.
  it("merges adjacent ranges", () => {
    expect(normalizeRanges([r(1, 40), r(41, 50)])).toEqual([r(1, 50)]);
  });

  it("swallows a range wholly inside another", () => {
    expect(normalizeRanges([r(1, 100), r(20, 30)])).toEqual([r(1, 100)]);
  });

  it("keeps a real gap", () => {
    expect(normalizeRanges([r(1, 40), r(42, 50)])).toEqual([r(1, 40), r(42, 50)]);
  });

  it("does not mutate its input", () => {
    const input = [r(1, 40), r(30, 50)];
    normalizeRanges(input);
    expect(input).toEqual([r(1, 40), r(30, 50)]);
  });
});

describe("unionRanges", () => {
  // The case the whole change exists for: the same arc owned in two places is
  // owned once. Summing the counts would claim 54.
  it("counts an overlap between two sources only once", () => {
    const tapas = [r(1, 40)];
    const webtoon = [r(30, 40), r(55), r(60), r(70)];

    const union = unionRanges([tapas, webtoon]);
    expect(union).toEqual([r(1, 40), r(55), r(60), r(70)]);
    expect(countChapters(union)).toBe(43);
    expect(countChapters(tapas) + countChapters(webtoon)).toBe(54);
  });

  it("joins two sources that between them cover a run", () => {
    expect(unionRanges([[r(1, 40)], [r(41, 54)]])).toEqual([r(1, 54)]);
  });

  it("is empty for a title owned nowhere", () => {
    expect(unionRanges([])).toEqual([]);
    expect(unionRanges([[], []])).toEqual([]);
  });
});

describe("countChapters", () => {
  it("counts a single chapter as one", () => {
    expect(countChapters([r(7)])).toBe(1);
  });

  it("counts an inclusive range from both ends", () => {
    expect(countChapters([r(1, 40)])).toBe(40);
  });

  it("adds disjoint ranges", () => {
    expect(countChapters([r(1, 40), r(55), r(60)])).toBe(42);
  });

  it("is zero for nothing owned", () => {
    expect(countChapters([])).toBe(0);
  });
});

describe("gapsWithin", () => {
  it("finds a hole between two runs", () => {
    expect(gapsWithin([r(1, 40), r(55, 60)])).toEqual([r(41, 54)]);
  });

  it("finds several holes", () => {
    expect(gapsWithin([r(1, 40), r(55), r(60)])).toEqual([
      r(41, 54),
      r(56, 59),
    ]);
  });

  it("finds none in a contiguous run", () => {
    expect(gapsWithin([r(1, 40)])).toEqual([]);
  });

  // Everything past the last owned chapter is simply not bought yet, which is
  // ordinary. Only a hole in the middle is a surprise worth reporting.
  it("does not treat the unbought tail as a gap", () => {
    expect(gapsWithin([r(1, 40)])).toEqual([]);
    expect(gapsWithin([])).toEqual([]);
  });
});

describe("parseRanges", () => {
  it("reads a range", () => {
    expect(parseRanges("1-40")).toEqual({ ok: true, ranges: [r(1, 40)] });
  });

  // The rule that makes a list mean one thing: "55, 60" is plainly two
  // chapters, so a lone "55" has to be one too.
  it("reads a bare number as that one chapter", () => {
    expect(parseRanges("55")).toEqual({ ok: true, ranges: [r(55)] });
  });

  it("reads a mixed list", () => {
    expect(parseRanges("1-40, 55, 60-62")).toEqual({
      ok: true,
      ranges: [r(1, 40), r(55), r(60, 62)],
    });
  });

  it("tolerates the dashes a phone or a paste produces", () => {
    expect(parseRanges("1 – 40")).toEqual({ ok: true, ranges: [r(1, 40)] });
    expect(parseRanges("1—40")).toEqual({ ok: true, ranges: [r(1, 40)] });
  });

  it("tolerates loose spacing and trailing commas", () => {
    expect(parseRanges("  1-40 ,, 55 , ")).toEqual({
      ok: true,
      ranges: [r(1, 40), r(55)],
    });
  });

  it("normalises what it reads", () => {
    expect(parseRanges("55, 1-40, 30-35")).toEqual({
      ok: true,
      ranges: [r(1, 40), r(55)],
    });
  });

  // Clearing the field is how a count is removed, so it cannot be an error.
  it("reads an empty field as nothing owned", () => {
    expect(parseRanges("")).toEqual({ ok: true, ranges: [] });
    expect(parseRanges("   ")).toEqual({ ok: true, ranges: [] });
  });

  it("rejects something that is not a number", () => {
    const result = parseRanges("1-40, abc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("abc");
  });

  it("rejects chapter zero", () => {
    expect(parseRanges("0-5")).toMatchObject({ ok: false });
    expect(parseRanges("0")).toMatchObject({ ok: false });
  });

  it("rejects a backwards range", () => {
    const result = parseRanges("40-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("backwards");
  });

  it("rejects a negative chapter", () => {
    // The minus reads as a separator, so this is "-5" failing the shape check
    // rather than a negative number — either way it must not parse.
    expect(parseRanges("-5")).toMatchObject({ ok: false });
  });
});

describe("formatting", () => {
  it("writes a range with an en dash and a lone chapter bare", () => {
    expect(formatRanges([r(1, 40), r(55)])).toBe("1–40, 55");
  });

  it("writes the input form with a hyphen instead", () => {
    expect(formatRangesForInput([r(1, 40), r(55)])).toBe("1-40, 55");
  });

  it("is empty for nothing owned", () => {
    expect(formatRanges([])).toBe("");
    expect(formatRangesForInput([])).toBe("");
  });

  // The field has to survive being shown and re-submitted unchanged.
  it("round-trips through the parser", () => {
    const ranges = [r(1, 40), r(55), r(60, 62)];
    const parsed = parseRanges(formatRangesForInput(ranges));
    expect(parsed).toEqual({ ok: true, ranges });
  });
});

describe("the Postgres boundary", () => {
  // Postgres canonicalises int ranges to a half-open upper bound, so [1,41)
  // is chapters 1 through 40.
  it("reads the canonical half-open form as inclusive", () => {
    expect(fromMultirange("{[1,41)}")).toEqual([r(1, 40)]);
  });

  it("reads several ranges", () => {
    expect(fromMultirange("{[1,41),[55,56),[60,61)}")).toEqual([
      r(1, 40),
      r(55),
      r(60),
    ]);
  });

  it("reads an inclusive upper bound if one ever arrives", () => {
    expect(fromMultirange("{[1,40]}")).toEqual([r(1, 40)]);
  });

  it("reads an exclusive lower bound if one ever arrives", () => {
    expect(fromMultirange("{(0,41)}")).toEqual([r(1, 40)]);
  });

  it("reads an empty or absent value as nothing owned", () => {
    expect(fromMultirange("{}")).toEqual([]);
    expect(fromMultirange(null)).toEqual([]);
    expect(fromMultirange(undefined)).toEqual([]);
    expect(fromMultirange("")).toEqual([]);
  });

  // A row that cannot be read should render as "owned, not counted", never
  // take the entry page down.
  it("reads nonsense as nothing owned rather than throwing", () => {
    expect(fromMultirange("not a multirange")).toEqual([]);
  });

  it("writes the canonical half-open form", () => {
    expect(toMultirange([r(1, 40), r(55)])).toBe("{[1,41),[55,56)}");
  });

  // Null is the single spelling of "nothing here" — the column's check
  // constraint rejects an empty multirange so there cannot be two.
  it("writes null for nothing owned", () => {
    expect(toMultirange([])).toBeNull();
  });

  it("normalises on the way out", () => {
    expect(toMultirange([r(41, 50), r(1, 40)])).toBe("{[1,51)}");
  });

  it("round-trips through Postgres's own form", () => {
    const ranges = [r(1, 40), r(55), r(60, 62)];
    expect(fromMultirange(toMultirange(ranges))).toEqual(ranges);
  });
});

describe("stepHighest", () => {
  it("owns the next chapter above the highest", () => {
    expect(stepHighest([r(1, 40)], 1)).toEqual([r(1, 41)]);
  });

  it("starts at chapter 1 when nothing is owned", () => {
    // Not chapter 0 — chapters are numbered from 1, and the column's check
    // constraint would reject it anyway.
    expect(stepHighest([], 1)).toEqual([r(1)]);
  });

  // The ambiguous case, decided: the trailing run is where someone is reading,
  // so the step continues it rather than jumping back to fill an old gap.
  it("extends the trailing run, not the first gap", () => {
    expect(stepHighest([r(1, 40), r(100)], 1)).toEqual([r(1, 40), r(100, 101)]);
  });

  it("gives back the highest chapter", () => {
    expect(stepHighest([r(1, 41)], -1)).toEqual([r(1, 40)]);
  });

  it("drops a run of one rather than inverting it", () => {
    expect(stepHighest([r(1, 40), r(55)], -1)).toEqual([r(1, 40)]);
    expect(stepHighest([r(7)], -1)).toEqual([]);
  });

  it("does nothing when there is nothing to give back", () => {
    expect(stepHighest([], -1)).toEqual([]);
  });

  it("stops at MAL's total", () => {
    expect(stepHighest([r(1, 179)], 1, 179)).toEqual([r(1, 179)]);
    expect(stepHighest([r(1, 178)], 1, 179)).toEqual([r(1, 179)]);
  });

  it("climbs freely when no total is known", () => {
    expect(stepHighest([r(1, 500)], 1)).toEqual([r(1, 501)]);
  });

  // Returned unchanged means "nothing happened", which is how the caller
  // decides whether the button should be disabled.
  it("returns an equal value when it cannot move", () => {
    const at = [r(1, 179)];
    expect(stepHighest(at, 1, 179)).toEqual(at);
  });

  it("merges when a step closes a one-chapter gap", () => {
    // 1-39 and 41-45: stepping the trailing run cannot close it, but a step
    // that ever does must not leave two touching runs behind.
    expect(stepHighest([r(1, 39), r(41, 45)], 1)).toEqual([r(1, 39), r(41, 46)]);
    expect(stepHighest([r(1, 40), r(42, 42)], -1)).toEqual([r(1, 40)]);
  });

  it("does not mutate its input", () => {
    const input = [r(1, 40)];
    stepHighest(input, 1);
    expect(input).toEqual([r(1, 40)]);
  });
});

describe("highestOwned", () => {
  it("is the top of the last run", () => {
    expect(highestOwned([r(1, 40), r(55, 60)])).toBe(60);
  });

  it("is null when nothing is owned", () => {
    expect(highestOwned([])).toBeNull();
  });

  it("normalises before answering", () => {
    expect(highestOwned([r(55, 60), r(1, 40)])).toBe(60);
  });
});
