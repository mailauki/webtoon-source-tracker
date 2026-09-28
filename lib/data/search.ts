/**
 * What a search matches on.
 *
 * Shared by the search page's client components and the MAL route handler, so
 * the two halves of one search — the shelf you already own and the catalog you
 * don't — can never disagree about what a term finds or about which side of
 * the novel/webtoon switch a title falls on. Deliberately free of
 * `server-only` and of any server import for that reason.
 */

/** MAL's own minimum; shorter queries return noise from the catalog. */
export const MIN_QUERY_LENGTH = 3;

/**
 * The title fields a row carries, from either side of the search.
 *
 * `alt_titles` is optional so callers that only have the two display titles —
 * a catalog hit, a row from an older query — still type-check and match on
 * what they have.
 */
type Titles =
  | {
      title?: string | null;
      title_en?: string | null;
      alt_titles?: readonly string[] | null;
    }
  | null
  | undefined;

/**
 * A string reduced to what a person means when they type it.
 *
 * Accents come off (`é` → `e`), case goes, and every run of punctuation or
 * whitespace becomes one space — so "Re:Zero", "re zero" and "RE - ZERO" are
 * the same string. Recomposed at the end because stripping marks from the
 * decomposed form leaves Hangul as loose jamo, and a Korean title should still
 * compare syllable to syllable.
 */
export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A normalized title with its spaces removed as well. */
type Prepared = { spaced: string; compact: string };

function prepare(value: string): Prepared {
  const spaced = normalizeTitle(value);
  return { spaced, compact: spaced.replaceAll(" ", "") };
}

/**
 * Prepared titles per row object.
 *
 * The shelf is re-matched on every settled keystroke, but its rows never
 * change between them, so normalizing each title once and reusing it is what
 * keeps a large library from redoing the same Unicode work per character.
 * Weak, so a row the page has let go of takes its entry with it.
 */
const preparedTitles = new WeakMap<object, Prepared[]>();

function titlesOf(titles: NonNullable<Titles>): Prepared[] {
  const cached = preparedTitles.get(titles);
  if (cached) return cached;

  const prepared = [titles.title, titles.title_en, ...(titles.alt_titles ?? [])]
    .filter((value): value is string => Boolean(value))
    .map(prepare)
    .filter((value) => value.compact !== "");

  preparedTitles.set(titles, prepared);
  return prepared;
}

/**
 * How many typos a term of this length is allowed.
 *
 * None under five characters: a four-letter word one edit from a match is
 * one edit from dozens, and the short terms are the ones typed straight
 * through rather than misspelled. One up to eight characters, two beyond.
 */
function allowedTypos(length: number): number {
  if (length < 5) return 0;
  if (length < 9) return 1;
  return 2;
}

/**
 * The fewest edits that turn `term` into some stretch of `text`.
 *
 * Sellers' approximate substring match with adjacent transpositions counted as
 * one edit (optimal string alignment), so "levleing" finds "leveling". A match
 * may start anywhere in `text`, which is what makes this a search rather than
 * a comparison of whole titles. Anything over `limit` comes back as
 * `limit + 1`, so callers only ever compare against the bound they chose.
 */
function typoDistance(term: string, text: string, limit: number): number {
  const m = term.length;
  // Three rows of the DP over `term`, reused across every column of `text`.
  let beforePrev = new Int32Array(m + 1);
  let prev = new Int32Array(m + 1);
  let row = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;

  let best = prev[m];

  for (let j = 1; j <= text.length; j++) {
    // Row 0 is 0 in every column: a match may begin at any position.
    row[0] = 0;

    for (let i = 1; i <= m; i++) {
      const cost = term[i - 1] === text[j - 1] ? 0 : 1;
      let value = Math.min(
        prev[i] + 1, // a character of `text` the term does not have
        row[i - 1] + 1, // a character of the term `text` does not have
        prev[i - 1] + cost, // the same character, or a substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        term[i - 1] === text[j - 2] &&
        term[i - 2] === text[j - 1]
      ) {
        value = Math.min(value, beforePrev[i - 2] + 1);
      }
      row[i] = value;
    }

    best = Math.min(best, row[m]);
    if (best === 0) return 0;

    [beforePrev, prev, row] = [prev, row, beforePrev];
  }

  return best <= limit ? best : limit + 1;
}

/**
 * How well a row's titles match the term, or null for no match. Lower is
 * better, so results can be ordered with the closest first:
 *
 * - `0` — the term appears as typed, give or take case, accents and
 *   punctuation. "re zero" finds "Re:Zero".
 * - `1` — it appears once spaces are ignored too. "rezero" finds "Re:Zero",
 *   and "solo leveling" finds a title written "SoloLeveling".
 * - `2` and up — it appears with a typo or two; `2 + edits`. Only for terms
 *   long enough to carry one — see allowedTypos.
 *
 * Every title the row has is checked — the romanised one, the English one and
 * every alternate — because the card shows one and the user may know the
 * title by any of the others.
 *
 * `term` may arrive raw; it is normalized here the same way the titles are.
 */
export function titleMatchScore(titles: Titles, term: string): number | null {
  if (!titles) return null;
  const query = prepare(term);
  if (query.compact === "") return null;

  const candidates = titlesOf(titles);

  if (candidates.some((c) => c.spaced.includes(query.spaced))) return 0;
  if (candidates.some((c) => c.compact.includes(query.compact))) return 1;

  const limit = allowedTypos(query.compact.length);
  if (limit === 0) return null;

  let best = limit + 1;
  for (const candidate of candidates) {
    best = Math.min(best, typoDistance(query.compact, candidate.compact, limit));
    if (best === 1) break;
  }
  return best <= limit ? 2 + best : null;
}

/** Whether any of a row's titles matches the term. See titleMatchScore. */
export function matchesTitle(titles: Titles, term: string): boolean {
  return titleMatchScore(titles, term) !== null;
}

/**
 * The alternate titles worth storing for a row: every candidate that is not
 * empty and not already one of its display titles, each kept once.
 *
 * Compared normalized, so a synonym that differs from the main title only in
 * case or punctuation is not stored twice — it would match the same terms.
 */
export function collectAltTitles(
  displayed: readonly (string | null | undefined)[],
  candidates: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set(
    displayed.filter((v): v is string => Boolean(v)).map(normalizeTitle),
  );
  const kept: string[] = [];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    const key = normalizeTitle(value);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
  }

  return kept;
}

/* ------------------------------------------------------------------------ */
/* Novels vs. everything else                                               */
/* ------------------------------------------------------------------------ */

/**
 * Which half of the catalog a search is looking at.
 *
 * A two-state switch rather than a three-state filter with an "all": the two
 * halves read completely differently — a light novel has volumes and a
 * translation group, a webtoon has weekly chapters and a site you read it on —
 * and mixing them puts the thing you are not looking for between the rows you
 * are. `webtoons` is everything that is not a novel, which is the app's own
 * vocabulary for it: webtoons, manga, manhwa, manhua, one-shots, doujinshi.
 */
export const MEDIA_KINDS = ["webtoons", "novels"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Webtoons, because that is what the rest of the app is for. */
export const DEFAULT_MEDIA_KIND: MediaKind = "webtoons";

/**
 * MAL's `media_type` values that are prose rather than panels.
 *
 * `novel` and `light_novel` are separate values on MAL, not synonyms — the
 * first is a full novel, the second the illustrated serialised kind — and both
 * belong on the novels side of the switch.
 */
const NOVEL_KINDS = new Set(["novel", "light_novel"]);

/**
 * Whether a MAL `media_type` is a novel.
 *
 * An unknown or missing kind is NOT a novel. Every other value MAL uses is
 * something with panels, and a row that simply never got a kind synced should
 * stay on the default side of the switch rather than vanishing from both.
 */
export function isNovel(kind: string | null | undefined): boolean {
  return NOVEL_KINDS.has(kind ?? "");
}

/** Whether a title belongs on the given side of the switch. */
export function matchesMediaKind(
  kind: string | null | undefined,
  side: MediaKind,
): boolean {
  return side === "novels" ? isNovel(kind) : !isNovel(kind);
}

/**
 * Parse a stored side.
 *
 * Anything unrecognised falls back to the default, the same way resolveSort
 * does: a preference written by a version of this app that offered a value
 * this one dropped should quietly show webtoons, not throw on render.
 */
export function resolveMediaKind(
  saved: string | null | undefined,
): MediaKind {
  return (MEDIA_KINDS as readonly string[]).includes(saved ?? "")
    ? (saved as MediaKind)
    : DEFAULT_MEDIA_KIND;
}
