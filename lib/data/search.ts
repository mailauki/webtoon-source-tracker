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

/** The two title fields a row carries, from either side of the search. */
type Titles =
  | { title?: string | null; title_en?: string | null }
  | null
  | undefined;

/**
 * Whether a title contains the search term.
 *
 * Both titles are checked because the card shows one and the user may know the
 * other — a romanised title on the cover is no reason for the English name not
 * to find it. `term` arrives already trimmed and lowercased so this does not
 * redo that work per row.
 *
 * A substring match, matching the `ilike '%term%'` the server used to run, so
 * searching the shelf in the browser finds exactly what a query would.
 */
export function matchesTitle(titles: Titles, term: string): boolean {
  if (!titles) return false;
  return (
    (titles.title?.toLowerCase().includes(term) ?? false) ||
    (titles.title_en?.toLowerCase().includes(term) ?? false)
  );
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
