/**
 * Reading AniList's view of a title against what the app already has.
 *
 * Pure and dependency-light for the reason `source-links.ts` gives: the entry
 * page and the tests both need it, and neither needs the server graph.
 */

import { canonicalUrl } from "@/lib/data/canonical-url";

/** One of AniList's `externalLinks`, reduced to what matching reads. */
export type ExternalLink = {
  url: string | null;
  site: string;
  type: string | null;
  /** AniList spells this as an English name ("English"), never a code. */
  language: string | null;
  isDisabled: boolean | null;
};

/** An attachment already on the entry, with its source's home page. */
type Attached = {
  id: number;
  url: string | null;
  sources: { name: string; base_url: string | null } | null;
};

export type LinkSuggestion = {
  /** The entry_sources row this link would fill. */
  attachedId: number;
  sourceName: string;
  url: string;
};

function host(url: string): string | null {
  try {
    return new URL(canonicalUrl(url)).hostname;
  } catch {
    return null;
  }
}

/**
 * Pairs AniList's reading links with the candidates whose home page is on the
 * same host. The rules every caller shares:
 *
 * Matched on host, never on AniList's `site` label: AniList files
 * delitoon.de under "Lezhin", and trusting the label would put a German
 * reseller's URL on the Lezhin source. A candidate without a base URL
 * (Physical Copy, most custom sources) has no host to match and is skipped.
 *
 * Only links in the reader's language, `lang` being a BCP 47 code like "en".
 * WEBTOON and Manta serve every language from one host, so without this the
 * French edition's link could land on a source read in English. A link
 * AniList gives no language is skipped too: there is no telling which edition
 * it is.
 *
 * First link wins per candidate, and first candidate per host.
 */
function matchLinks<T>(
  links: ExternalLink[] | null | undefined,
  candidates: T[],
  baseUrl: (candidate: T) => string | null | undefined,
  lang: string,
): { candidate: T; url: string }[] {
  // "en" → "English", the spelling AniList uses.
  const language = new Intl.DisplayNames(["en"], { type: "language" }).of(lang);

  const byHost = new Map<string, T>();
  for (const candidate of candidates) {
    const base = baseUrl(candidate);
    const h = base ? host(base) : null;
    if (h && !byHost.has(h)) byHost.set(h, candidate);
  }

  const matches: { candidate: T; url: string }[] = [];

  for (const link of links ?? []) {
    // INFO links are publishers' pages and SOCIAL ones are Twitter; only
    // STREAMING says "read it here".
    if (!link.url || link.isDisabled || link.type !== "STREAMING") continue;
    if (link.language !== language) continue;
    const h = host(link.url);
    const candidate = h ? byHost.get(h) : undefined;
    if (candidate === undefined) continue;

    byHost.delete(h!);
    matches.push({ candidate, url: canonicalUrl(link.url) });
  }

  return matches;
}

/**
 * AniList links for the sources the reader has attached but not given a URL.
 * A source that already has a URL is left alone — that link was hand-entered.
 */
export function suggestSourceLinks(
  links: ExternalLink[] | null | undefined,
  attached: Attached[],
  // The app's only language — see <html lang> in app/layout.tsx.
  lang = "en",
): LinkSuggestion[] {
  return matchLinks(
    links,
    attached.filter((row) => !row.url),
    (row) => row.sources?.base_url,
    lang,
  ).map(({ candidate, url }) => ({
    attachedId: candidate.id,
    sourceName: candidate.sources!.name,
    url,
  }));
}

/**
 * AniList's link for each catalog source it has one for, keyed by source id.
 *
 * What the add-source form offers: the link for the source being picked, and
 * a one-tap add for every other source AniList lists. A plain object rather
 * than a Map so it can cross from the server page to that client form.
 */
export function catalogLinks(
  links: ExternalLink[] | null | undefined,
  catalog: { id: number; base_url: string | null }[],
  lang = "en",
): Record<number, string> {
  return Object.fromEntries(
    matchLinks(links, catalog, (source) => source.base_url, lang).map(
      ({ candidate, url }) => [candidate.id, url],
    ),
  );
}

/**
 * The sentence reporting a chapter-count disagreement, or null when the two
 * sites agree.
 *
 * 0 and null both mean "not counted" on both sites, so those collapse
 * together first. A count only one site has is still a difference and is
 * reported: the other site's number is exactly what the reader came to find.
 */
export function chapterDifference(
  mal: number | null,
  anilist: number | null,
): string | null {
  const m = mal && mal > 0 ? mal : null;
  const a = anilist && anilist > 0 ? anilist : null;
  if (m === a) return null;
  if (m === null) return `MyAnimeList has no chapter count; AniList lists ${a}.`;
  if (a === null) return `AniList has no chapter count; MyAnimeList lists ${m}.`;
  return `MyAnimeList lists ${m} chapters; AniList lists ${a}.`;
}

/**
 * The highest real chapter count among those given, or null if none is one.
 *
 * Where the sites disagree, the higher count is the one progress can reach:
 * the lower one is almost always a site that has not caught up yet.
 */
export function higherChapterCount(
  ...counts: (number | null | undefined)[]
): number | null {
  const real = counts.filter((c): c is number => !!c && c > 0);
  return real.length ? Math.max(...real) : null;
}
