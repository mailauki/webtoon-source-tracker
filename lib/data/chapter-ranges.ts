/**
 * Which chapters are owned, as ranges.
 *
 * A count could only ever mean "1 through N", which is how the coin-gated apps
 * work but not how a library ends up looking: the app has 1–40, a print volume
 * covers 41–54, three chapters were bought loose. And two counts on two sources
 * cannot be added — owning 1–40 on both is 40 chapters, not 80 — so answering
 * "how much of this do I own" needs a union, not a sum.
 *
 * Ranges here are **inclusive at both ends**, because "1–40" is what a reader
 * means. Postgres stores the canonical half-open form (`[1,41)`), and the two
 * conversions at the bottom of this file are the only place that difference
 * exists. Everything above them speaks inclusive.
 *
 * Kept in `lib/data` rather than beside the form for the reason `source-links.ts`
 * gives: the form module imports the server actions it submits, and the entry
 * page, the dialog and the tests all need this without that graph.
 */

/** A run of owned chapters, inclusive of both ends. `1–1` is one chapter. */
export type ChapterRange = { start: number; end: number };

/* ------------------------------------------------------------------------ */
/* Normalising                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Sort, merge and dedupe a set of ranges.
 *
 * Adjacent ranges merge as well as overlapping ones: 1–40 and 41–50 is 1–50,
 * because chapters are discrete and there is no gap between them. That is also
 * what Postgres does to an int4multirange on the way in, so normalising the
 * same way here keeps a value read back from the database identical to the one
 * the browser computed — otherwise every save would appear to rewrite itself.
 */
export function normalizeRanges(ranges: ChapterRange[]): ChapterRange[] {
  const sorted = [...ranges]
    .filter((r) => r.end >= r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: ChapterRange[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    // `start - 1` is the adjacency case: touching runs become one.
    if (last && range.start - 1 <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      out.push({ ...range });
    }
  }
  return out;
}

/**
 * Every chapter owned anywhere, as one set.
 *
 * The union, never a sum: sources overlap constantly — the same first arc read
 * free on one app and bought on another — and adding counts would claim the
 * user owns twice what they do.
 */
export function unionRanges(sets: ChapterRange[][]): ChapterRange[] {
  return normalizeRanges(sets.flat());
}

/** How many chapters a set covers. */
export function countChapters(ranges: ChapterRange[]): number {
  return ranges.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
}

/**
 * The holes inside what is owned — 41–54 when 1–40 and 55–60 are held.
 *
 * Bounded by the owned span on purpose: everything after the last owned
 * chapter is "not bought yet", which is ordinary and not worth reporting as a
 * gap. A hole in the middle is the thing worth knowing about, because it is
 * usually a surprise.
 */
export function gapsWithin(ranges: ChapterRange[]): ChapterRange[] {
  const owned = normalizeRanges(ranges);
  const gaps: ChapterRange[] = [];
  for (let i = 1; i < owned.length; i++) {
    gaps.push({ start: owned[i - 1].end + 1, end: owned[i].start - 1 });
  }
  return gaps;
}

/* ------------------------------------------------------------------------ */
/* Reading and writing what a person types                                  */
/* ------------------------------------------------------------------------ */

/** A parse either produced ranges or has something to tell the user. */
export type ParseResult =
  | { ok: true; ranges: ChapterRange[] }
  | { ok: false; error: string };

/**
 * Read "1-40, 55, 60" into ranges.
 *
 * A bare number is that one chapter, not "up to" it. The two readings cannot
 * both hold — "55, 60" plainly means two chapters — and picking the other one
 * would make a list mean something different from its own first element. The
 * common "everything so far" case is a range (`1-40`) or the own-all button.
 *
 * Separators are loose on purpose (commas, spaces, en dashes): this is a field
 * someone types into, and rejecting `1 – 40` for its dash would be pedantry.
 * An empty string parses to no ranges rather than an error — that is how the
 * field is cleared.
 */
export function parseRanges(input: string): ParseResult {
  const text = input.trim();
  if (text === "") return { ok: true, ranges: [] };

  const ranges: ChapterRange[] = [];

  for (const token of text.split(",")) {
    const piece = token.trim();
    if (piece === "") continue;

    // en/em dashes are what a phone keyboard and a paste from elsewhere give.
    const match = piece.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/);
    if (!match) {
      return { ok: false, error: `Could not read “${piece}”. Try 1-40, 55.` };
    }

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);

    if (start < 1 || end < 1) {
      return { ok: false, error: "Chapters are numbered from 1." };
    }
    if (end < start) {
      return { ok: false, error: `“${piece}” runs backwards.` };
    }
    ranges.push({ start, end });
  }

  return { ok: true, ranges: normalizeRanges(ranges) };
}

/**
 * Ranges as a person reads them: "1–40, 55, 60".
 *
 * An en dash, not the hyphen the parser accepts — typing a hyphen is easier
 * and reading a dash is nicer, and nothing round-trips through this.
 */
export function formatRanges(ranges: ChapterRange[]): string {
  return normalizeRanges(ranges)
    .map((r) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`))
    .join(", ");
}

/**
 * The same, but with a hyphen, for putting back into the input.
 *
 * The field has to round-trip: what is shown must parse to what it came from,
 * and an en dash in an input someone is about to edit invites a hyphen next to
 * it that reads as a second, broken entry.
 */
export function formatRangesForInput(ranges: ChapterRange[]): string {
  return normalizeRanges(ranges)
    .map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`))
    .join(", ");
}

/* ------------------------------------------------------------------------ */
/* The Postgres boundary                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Parse what PostgREST hands back for an int4multirange: `{[1,41),[55,56)}`.
 *
 * Postgres canonicalises int ranges to `[lower, upper)`, so the upper bound is
 * always exclusive and always present on a stored value. This still reads an
 * inclusive `]` if one ever arrives, rather than silently dropping a chapter.
 *
 * Anything unreadable returns no ranges instead of throwing: a row that cannot
 * be parsed should render as "owned, not counted", not break the entry page.
 */
export function fromMultirange(
  value: string | null | undefined,
): ChapterRange[] {
  if (!value) return [];

  const ranges: ChapterRange[] = [];
  for (const [, open, lower, upper, close] of value.matchAll(
    /([[(])\s*(\d+)\s*,\s*(\d+)\s*([\])])/g,
  )) {
    const start = Number(lower) + (open === "(" ? 1 : 0);
    const end = Number(upper) - (close === ")" ? 1 : 0);
    if (end >= start) ranges.push({ start, end });
  }
  return normalizeRanges(ranges);
}

/**
 * Render ranges as an int4multirange literal for Postgres.
 *
 * Returns null for an empty set: the column's check constraint rejects an
 * empty multirange precisely so that "owns nothing here" has one spelling, and
 * null is it.
 */
export function toMultirange(ranges: ChapterRange[]): string | null {
  const normalized = normalizeRanges(ranges);
  if (normalized.length === 0) return null;
  return `{${normalized.map((r) => `[${r.start},${r.end + 1})`).join(",")}}`;
}
