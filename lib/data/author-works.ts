/**
 * "More from this author": a title's authors, and what else they made.
 *
 * The catalog does not store authors (see TODO.md, `TODO(authors)`), and it
 * could not answer this honestly if it did — `media_titles` holds only what
 * somebody tracks, so a shelf built from it would imply the author wrote
 * nothing else. AniList can: a title's staff each carry their own credits. So
 * the works come from AniList, live, and the library only decides where each
 * one links — a title the reader tracks opens its entry page, anything else
 * opens on AniList.
 *
 * Deliberately not `server-only`: the tests call these directly, and nothing
 * here reads anything.
 */

import type { AniListMediaStaff } from "@/lib/anilist/types";

/** One of the title's authors. */
export type AuthorCredit = {
  id: number;
  name: string;
  /** Their AniList page, where the rest of their credits are. */
  url: string | null;
  /** "Story", "Art"… — one person can hold both. */
  roles: string[];
};

/** A title one of the authors is credited on, not yet matched to the library. */
export type AuthorWork = {
  anilistId: number;
  malId: number | null;
  title: string;
  format: string | null;
  cover: string | null;
  isAdult: boolean;
  /** Where it opens when the reader does not track it. */
  externalUrl: string;
  /** Which of the authors it is credited to, in the authors' order. */
  authorIds: number[];
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
 * The title's authors, and every other manga they are credited on.
 *
 * Staff that are not authors are dropped, and a person AniList lists twice
 * (once per role) is folded into one credit. Works are deduplicated across
 * authors — a series both the writer and the artist are credited on is one
 * work with two `authorIds` — and the title itself is left out. Order is
 * AniList's: the authors by relevance, then each one's works by popularity.
 */
export function authorWorks(staff: AniListMediaStaff | null): {
  authors: AuthorCredit[];
  works: AuthorWork[];
} {
  const authors = new Map<number, AuthorCredit>();
  const works = new Map<number, AuthorWork>();
  if (!staff) return { authors: [], works: [] };

  for (const edge of staff.staff?.edges ?? []) {
    const node = edge.node;
    if (!node || !isAuthorRole(edge.role)) continue;

    const role = edge.role!.trim();
    const author = authors.get(node.id);
    if (author) {
      if (!author.roles.includes(role)) author.roles.push(role);
    } else {
      authors.set(node.id, {
        id: node.id,
        name: node.name?.full?.trim() || "Unknown author",
        url: node.siteUrl ?? null,
        roles: [role],
      });
    }

    for (const media of node.staffMedia?.nodes ?? []) {
      if (!media || media.id === staff.id) continue;

      const known = works.get(media.id);
      if (known) {
        if (!known.authorIds.includes(node.id)) known.authorIds.push(node.id);
        continue;
      }
      works.set(media.id, {
        anilistId: media.id,
        malId: media.idMal ?? null,
        title:
          media.title?.english?.trim() ||
          media.title?.romaji?.trim() ||
          "Untitled",
        format: media.format ?? null,
        cover: media.coverImage?.large ?? media.coverImage?.medium ?? null,
        isAdult: media.isAdult === true,
        externalUrl: media.siteUrl ?? `https://anilist.co/manga/${media.id}`,
        authorIds: [node.id],
      });
    }
  }

  return { authors: [...authors.values()], works: [...works.values()] };
}

/**
 * Lines the works up against the reader's shelf.
 *
 * A match on either id counts — a title synced from MyAnimeList may not have
 * its AniList id stored yet — and a tracked work takes the name and cover the
 * reader sees everywhere else in the app, so the same series does not look
 * like a different one here. Tracked works lead, since those are the ones
 * that link somewhere in the app; beyond that AniList's order holds.
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
