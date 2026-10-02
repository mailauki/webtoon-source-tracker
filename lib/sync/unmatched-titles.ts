import { z } from "zod";

import type { UnmatchedTitle } from "./plan-account-sync";

/**
 * Reading and linking the titles the last account sync could not pair.
 *
 * Stored as jsonb on anilist_connections, so it is parsed rather than
 * trusted: a row written before the column existed, or by an older shape,
 * reads as an empty list instead of breaking the settings page.
 */

const unmatchedTitleSchema = z.object({
  onlyOn: z.enum(["mal", "anilist"]),
  id: z.number().int(),
  title: z.string(),
});

export function parseUnmatchedTitles(value: unknown): UnmatchedTitle[] {
  const parsed = z.array(unmatchedTitleSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** The title's page on the site it was found on. */
export function titleUrl({ onlyOn, id }: UnmatchedTitle): string {
  return onlyOn === "mal"
    ? `https://myanimelist.net/manga/${id}`
    : `https://anilist.co/manga/${id}`;
}

/**
 * A search for the title on the site it is missing from.
 *
 * Often it is there, just not linked: AniList entries carry the MAL id by
 * hand, and an entry nobody linked looks the same to the sync as one that
 * does not exist.
 */
export function searchOtherSiteUrl({ onlyOn, title }: UnmatchedTitle): string {
  const q = encodeURIComponent(title);
  return onlyOn === "mal"
    ? `https://anilist.co/search/manga?search=${q}`
    : `https://myanimelist.net/manga.php?q=${q}&cat=manga`;
}
