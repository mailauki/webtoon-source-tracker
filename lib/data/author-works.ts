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
  anilist: { id: number; name: string; url: string | null; roles: string[] } | null;
  /**
   * How the two sites' credits were lined up: the same name once case, accents,
   * punctuation and word order are set aside, or — for a name the two sites
   * romanise differently — the same sound. See mergeAuthors. Null for an
   * author only one site credits.
   */
  matchedOn: "name" | "spelling" | null;
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
 * Letters that romanisations swap for one another, folded to one. Korean is
 * the main case: Revised Romanization and the older McCune–Reischauer write
 * one syllable as "Seong" or "Sung", "Rak" or "Lak", "Gim" or "Kim", "Bak" or
 * "Park" — and MyAnimeList and AniList each keep whichever spelling the
 * contributor typed. Pinyin's z/zh/q against Wade–Giles's ch/ts is the same
 * problem for Chinese names.
 */
const SOUND_FOLDS: Record<string, string> = {
  r: "l",
  b: "p",
  f: "p",
  v: "p",
  g: "k",
  q: "c",
  d: "t",
  j: "c",
  z: "c",
  x: "s",
};

/**
 * A name's consonants, folded: what is left once the letters romanisations
 * disagree about are gone. Vowels go entirely ("eo" against "u" is most of
 * the variation), as do y, w and h, which romanisations add and drop freely
 * ("Choi"/"Choe", "Hwang"/"Whang"), and a doubled letter counts once.
 *
 * Takes the whole name run together, so a syllable break the two sites place
 * differently does not change what counts as "before a vowel".
 */
function consonants(part: string): string {
  let out = "";
  for (const [i, letter] of [...part].entries()) {
    if (!/[a-z]/.test(letter) || "aeiouywh".includes(letter)) continue;
    // An "r" with no vowel after it is spelling, not sound: "Park" is the
    // same surname as "Bak" and "Pak". Before a vowel it is a real consonant
    // ("Rak"), folded to "l" below.
    if (letter === "r" && !"aeiou".includes(part[i + 1] ?? "")) continue;
    const folded = SOUND_FOLDS[letter] ?? letter;
    if (out.at(-1) !== folded) out += folded;
  }
  return out;
}

/**
 * The keys a name can be lined up on by sound, for spellings `nameKey`
 * cannot equate.
 *
 * Built from the whole name run together, so a syllable break the two sites
 * place differently ("Sung Lak" against "Sung-lak") does not matter, in every
 * rotation of its parts, so family-name-first and family-name-last are the
 * same key ("Jang Sung-lak", "Sung-lak Jang"). Latin letters only: a native-
 * script name has no romanisation to disagree about, and `nameKey` already
 * matches it exactly. A key under three consonants is dropped — "Lee" and
 * "Yi", or "Oda" and "Ueda", leave too little to tell people apart.
 */
export function soundKeys(name: string): Set<string> {
  const parts = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[\s,]+/)
    .map((part) => part.replace(/[^a-z]/g, ""))
    .filter(Boolean);

  const keys = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    const rotated = [...parts.slice(i), ...parts.slice(0, i)];
    const key = consonants(rotated.join(""));
    if (key.length >= 3) keys.add(key);
  }
  return keys;
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
    {
      id: number;
      name: string;
      keys: Set<string>;
      sounds: Set<string>;
      url: string | null;
      roles: string[];
    }
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
    const present = names.filter((name): name is string => Boolean(name?.trim()));
    byId.set(node.id, {
      id: node.id,
      name: node.name?.full?.trim() || node.name?.native?.trim() || "Unknown author",
      keys: new Set(present.map(nameKey)),
      sounds: new Set(present.flatMap((name) => [...soundKeys(name)])),
      url: node.siteUrl ?? null,
      roles: [role],
    });
  }

  return [...byId.values()];
}

/**
 * Lines up MyAnimeList's and AniList's authors for one title.
 *
 * Matched by name, since neither site records the other's person id, in two
 * passes — the same shape cross-search uses to line up titles:
 *
 * 1. **The same name**: any of AniList's names for a person (full, native,
 *    alternatives) against MAL's, as `nameKey`s — case, accents, punctuation
 *    and word order ignored, nothing else.
 * 2. **The same sound**, for authors the first pass left over: the two sites
 *    often romanise one Korean or Chinese name differently ("Sung-Lak Jang"
 *    and "Seong-Rak Jang"), and without this the page named one person twice
 *    and called the sites' credits different. Looser, so stricter about
 *    everything else. A pair merges only when their `soundKeys` meet, their
 *    roles do not contradict each other, and the match is unambiguous both
 *    ways — exactly one AniList candidate for the MAL author, and that
 *    candidate has no other MAL one. Two people whose names sound alike stay
 *    two people.
 *
 * `mal` or `anilist` null means that site did not answer, or does not have the
 * title: its authors are then simply absent, and nothing is reported as a
 * disagreement, because silence is not a different answer. Only when both
 * answered does a one-sided or differently-credited author count as one. A
 * different spelling is not a disagreement about who made the title, so it is
 * not reported as one; `anilist.name` keeps AniList's spelling for the page
 * to show.
 *
 * Order: MyAnimeList's credits first, then any only AniList has — the same
 * precedence cross-search gives a merged row.
 */
export function mergeAuthors(
  mal: MalAuthor[] | null,
  anilist: AniListStaff | null | undefined,
): { authors: MergedAuthor[]; mismatches: AuthorMismatch[] } {
  const fromAniList = anilistAuthors(anilist);

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
  const malPeople = [...malById.values()];

  type AniListPerson = (typeof fromAniList)[number];
  const links = new Map<number, { person: AniListPerson; on: "name" | "spelling" }>();
  const claimed = new Set<number>();

  // Pass 1: the same name.
  for (const person of malPeople) {
    const key = nameKey(person.name);
    const match = fromAniList.find(
      (candidate) => !claimed.has(candidate.id) && candidate.keys.has(key),
    );
    if (!match) continue;
    claimed.add(match.id);
    links.set(person.id, { person: match, on: "name" });
  }

  // Pass 2: the same sound, over whoever pass 1 left unmatched on both sides.
  const rolesAgree = (a: string[], b: string[]) => {
    const left = roleParts(a);
    const right = roleParts(b);
    // An unrecorded role is not a contradicting one.
    return !left || !right || left === right;
  };
  const candidates = new Map<number, AniListPerson[]>();
  for (const person of malPeople) {
    if (links.has(person.id)) continue;
    const sounds = soundKeys(person.name);
    candidates.set(
      person.id,
      fromAniList.filter(
        (candidate) =>
          !claimed.has(candidate.id) &&
          [...sounds].some((key) => candidate.sounds.has(key)) &&
          rolesAgree(person.roles, candidate.roles),
      ),
    );
  }
  for (const [malId, found] of candidates) {
    if (found.length !== 1) continue;
    const [match] = found;
    // The other direction: no second MAL author claims this person too.
    const rivals = [...candidates.values()].filter((list) => list.includes(match));
    if (rivals.length !== 1) continue;
    claimed.add(match.id);
    links.set(malId, { person: match, on: "spelling" });
  }

  const authors: MergedAuthor[] = [];
  for (const person of malPeople) {
    const link = links.get(person.id);
    const match = link?.person;
    authors.push({
      key: `mal:${person.id}`,
      name: person.name,
      roles: person.roles.length > 0 ? person.roles : (match?.roles ?? []),
      mal: {
        id: person.id,
        url: `https://myanimelist.net/people/${person.id}`,
        roles: person.roles,
      },
      anilist: match
        ? { id: match.id, name: match.name, url: match.url, roles: match.roles }
        : null,
      matchedOn: link?.on ?? null,
    });
  }

  for (const person of fromAniList) {
    if (claimed.has(person.id)) continue;
    authors.push({
      key: `anilist:${person.id}`,
      name: person.name,
      roles: person.roles,
      mal: null,
      anilist: { id: person.id, name: person.name, url: person.url, roles: person.roles },
      matchedOn: null,
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
