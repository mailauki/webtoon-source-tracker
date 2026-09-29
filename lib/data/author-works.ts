/**
 * A title's authors, as both sites credit them, and what else they made.
 *
 * The catalog does not store authors (see TODO.md, `TODO(authors)`), so both
 * halves are read live, on requests the entry page already makes:
 *
 * - **Who made it** comes from MyAnimeList and AniList together. The two are
 *   lined up by name — neither site records the other's person id — and where
 *   they disagree, about who is credited or for what, the page says so, the
 *   same way it flags a chapter-count disagreement.
 * - **What else they made** comes from AniList alone. MAL's v2 API has no way
 *   to list a person's works, and `media_titles` holds only what somebody
 *   tracks, so a shelf built from it would imply the author wrote nothing
 *   else. AniList's staff credits carry every title. The library only decides
 *   what each one offers: a title the reader tracks opens its entry page,
 *   anything else can be added.
 *
 * Deliberately not `server-only`: the tests call these directly, and nothing
 * here reads anything.
 */

import type { AniListMediaExtras } from "@/lib/anilist/types";
import type { MalAuthor } from "@/lib/mal/endpoints";

type AniListStaff = NonNullable<AniListMediaExtras["staff"]>;

/** One of the title's authors, with each site's credit where it has one. */
export type MergedAuthor = {
  /** Stable across renders: the site and that site's person id. */
  key: string;
  /** MyAnimeList's spelling where it has one, as elsewhere in the app. */
  name: string;
  /** The credit to show: MyAnimeList's where it has one, else AniList's. */
  roles: string[];
  mal: { id: number; url: string; roles: string[] } | null;
  anilist: { id: number; url: string | null; roles: string[] } | null;
};

/** Somewhere the two sites' credits for this title disagree. */
export type AuthorMismatch =
  | { kind: "missing"; name: string; creditedBy: "mal" | "anilist" }
  | { kind: "roles"; name: string; mal: string; anilist: string };

/** A title one of the authors is credited on, not yet matched to the library. */
export type AuthorWork = {
  anilistId: number;
  malId: number | null;
  title: string;
  format: string | null;
  cover: string | null;
  isAdult: boolean;
};

/** A title on the reader's shelf, as far as matching needs it. */
export type LibraryMatch = {
  entryId: number;
  anilistMediaId: number | null;
  malMediaId: number | null;
  title: string;
  cover: string | null;
};

/** A work, resolved: `entryId` set when the reader already tracks it. */
export type RelatedWork = AuthorWork & { entryId: number | null };

/**
 * Whether an AniList staff credit makes someone an author of the title.
 *
 * AniList's roles are free text. The ones that mean "made this" lead with
 * Story, Art, Original Creator or (for a novel) Illustration — "Story & Art",
 * "Art (ch 1-40)". The ones that do not lead with something else:
 * "Translator (English)", "Lettering", "Touch-up Art & Lettering",
 * "Assistant". Anchoring at the start is what keeps "Touch-up Art" out.
 */
export function isAuthorRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return /^(story|art|original (creator|story|work)|illustration)\b/i.test(role.trim());
}

/**
 * A name as a comparison key: case, accents, punctuation and word order all
 * ignored. Word order matters most — MAL stores a family and a given name
 * and AniList one `full` string, and the two sites do not agree on which
 * comes first for Korean and Chinese names. "Sung-Lak Jang" and "Jang
 * Sung-lak" are one person.
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[\s,]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * A credit reduced to what it means, for comparing across sites: "Story & Art"
 * and a "Story" credit plus an "Art" credit are the same claim. Parentheticals
 * ("Art (ch 1-40)") are detail one site records and the other does not.
 */
function roleParts(roles: string[]): string {
  const parts = new Set<string>();
  for (const role of roles) {
    for (const part of role.replace(/\(.*?\)/g, "").split(/&|,|\//)) {
      const trimmed = part.trim().toLowerCase();
      if (!trimmed) continue;
      // "Original Creator" is AniList's name for the writer of the source.
      parts.add(trimmed.startsWith("original") ? "story" : trimmed);
    }
  }
  return [...parts].sort().join(" & ");
}

/** Each AniList author once, with every author credit they hold. */
function anilistAuthors(staff: AniListStaff | null | undefined) {
  const byId = new Map<
    number,
    { id: number; name: string; keys: Set<string>; url: string | null; roles: string[] }
  >();

  for (const edge of staff?.edges ?? []) {
    const node = edge.node;
    if (!node || !isAuthorRole(edge.role)) continue;

    const role = edge.role!.trim();
    const known = byId.get(node.id);
    if (known) {
      if (!known.roles.includes(role)) known.roles.push(role);
      continue;
    }

    const names = [node.name?.full, node.name?.native, ...(node.name?.alternative ?? [])];
    const keys = new Set(
      names.flatMap((name) => (name?.trim() ? [nameKey(name)] : [])),
    );
    byId.set(node.id, {
      id: node.id,
      name: node.name?.full?.trim() || node.name?.native?.trim() || "Unknown author",
      keys,
      url: node.siteUrl ?? null,
      roles: [role],
    });
  }

  return [...byId.values()];
}

/**
 * Lines up MyAnimeList's and AniList's authors for one title.
 *
 * Matched by name, since neither site records the other's person id: any of
 * AniList's names for a person (full, native, alternatives) against MAL's, as
 * `nameKey`s. Exact keys only — two people with near-identical romanised names
 * are more likely than a typo, and fusing them would hide a real disagreement.
 *
 * `mal` or `anilist` null means that site did not answer, or does not have the
 * title: its authors are then simply absent, and nothing is reported as a
 * disagreement, because silence is not a different answer. Only when both
 * answered does a one-sided or differently-credited author count as one.
 *
 * Order: MyAnimeList's credits first, then any only AniList has — the same
 * precedence cross-search gives a merged row.
 */
export function mergeAuthors(
  mal: MalAuthor[] | null,
  anilist: AniListStaff | null | undefined,
): { authors: MergedAuthor[]; mismatches: AuthorMismatch[] } {
  const fromAniList = anilistAuthors(anilist);
  const claimed = new Set<number>();
  const authors: MergedAuthor[] = [];

  // MAL lists "Story" and "Art" as separate rows for one person too.
  const malById = new Map<number, { id: number; name: string; roles: string[] }>();
  for (const credit of mal ?? []) {
    const known = malById.get(credit.id);
    const role = credit.role?.trim();
    if (known) {
      if (role && !known.roles.includes(role)) known.roles.push(role);
    } else {
      malById.set(credit.id, { id: credit.id, name: credit.name, roles: role ? [role] : [] });
    }
  }

  for (const person of malById.values()) {
    const key = nameKey(person.name);
    const match = fromAniList.find(
      (candidate) => !claimed.has(candidate.id) && candidate.keys.has(key),
    );
    if (match) claimed.add(match.id);

    authors.push({
      key: `mal:${person.id}`,
      name: person.name,
      roles: person.roles.length > 0 ? person.roles : (match?.roles ?? []),
      mal: {
        id: person.id,
        url: `https://myanimelist.net/people/${person.id}`,
        roles: person.roles,
      },
      anilist: match ? { id: match.id, url: match.url, roles: match.roles } : null,
    });
  }

  for (const person of fromAniList) {
    if (claimed.has(person.id)) continue;
    authors.push({
      key: `anilist:${person.id}`,
      name: person.name,
      roles: person.roles,
      mal: null,
      anilist: { id: person.id, url: person.url, roles: person.roles },
    });
  }

  const bothAnswered = mal !== null && anilist != null;
  const mismatches: AuthorMismatch[] = [];
  if (bothAnswered) {
    for (const author of authors) {
      if (!author.mal || !author.anilist) {
        mismatches.push({
          kind: "missing",
          name: author.name,
          creditedBy: author.mal ? "mal" : "anilist",
        });
        continue;
      }
      const malRoles = roleParts(author.mal.roles);
      const anilistRoles = roleParts(author.anilist.roles);
      // An empty side is an unrecorded role, not a different one.
      if (malRoles && anilistRoles && malRoles !== anilistRoles) {
        mismatches.push({
          kind: "roles",
          name: author.name,
          mal: author.mal.roles.join(", "),
          anilist: author.anilist.roles.join(", "),
        });
      }
    }
  }

  return { authors, mismatches };
}

/**
 * Every other manga the title's authors are credited on, from AniList.
 *
 * Only author credits count — a translator's other work is not "more from
 * this author". Works are deduplicated across authors (a series the writer
 * and the artist both made appears once), and the title itself is left out.
 * Order is AniList's: authors by relevance, then each one's works by
 * popularity. Empty when AniList did not answer, or was not asked for works.
 */
export function authorWorks(
  media: Pick<AniListMediaExtras, "id" | "staff"> | null,
): AuthorWork[] {
  const works = new Map<number, AuthorWork>();
  if (!media) return [];

  for (const edge of media.staff?.edges ?? []) {
    if (!edge.node || !isAuthorRole(edge.role)) continue;

    for (const work of edge.node.staffMedia?.nodes ?? []) {
      if (!work || work.id === media.id || works.has(work.id)) continue;
      works.set(work.id, {
        anilistId: work.id,
        malId: work.idMal ?? null,
        title: work.title?.english?.trim() || work.title?.romaji?.trim() || "Untitled",
        format: work.format ?? null,
        cover: work.coverImage?.large ?? work.coverImage?.medium ?? null,
        isAdult: work.isAdult === true,
      });
    }
  }

  return [...works.values()];
}

/**
 * Lines the works up against the reader's shelf.
 *
 * A match on either id counts — a title synced from MyAnimeList may not have
 * its AniList id stored yet — and a tracked work takes the name and cover the
 * reader sees everywhere else in the app, so the same series does not look
 * like a different one here. Tracked works lead; beyond that AniList's order
 * holds.
 *
 * Adult works are dropped when the reader hides them, tracked or not: this is
 * a browsing surface, the same as the shelf, which hides them too.
 */
export function relatedWorks(
  works: AuthorWork[],
  library: LibraryMatch[],
  { hideMature, limit = 12 }: { hideMature: boolean; limit?: number },
): RelatedWork[] {
  const byAniList = new Map<number, LibraryMatch>();
  const byMal = new Map<number, LibraryMatch>();
  for (const match of library) {
    if (match.anilistMediaId !== null) byAniList.set(match.anilistMediaId, match);
    if (match.malMediaId !== null) byMal.set(match.malMediaId, match);
  }

  const resolved = works
    .filter((work) => !(hideMature && work.isAdult))
    .map((work): RelatedWork => {
      const match =
        byAniList.get(work.anilistId) ??
        (work.malId !== null ? byMal.get(work.malId) : undefined);
      if (!match) return { ...work, entryId: null };
      return {
        ...work,
        entryId: match.entryId,
        title: match.title,
        cover: match.cover ?? work.cover,
      };
    });

  const tracked = resolved.filter((work) => work.entryId !== null);
  const untracked = resolved.filter((work) => work.entryId === null);
  return [...tracked, ...untracked].slice(0, limit);
}
