/**
 * Which poster to draw for a tracked title, and which others it could wear.
 *
 * `media_titles.main_picture_url` is the catalog's cover: shared by every
 * reader, and rewritten by every sync. A reader who prefers another poster —
 * a later volume's art, AniList's cover, or one they found themselves — keeps
 * that choice on their own row, in `user_entries.cover_url`, and it wins
 * wherever the title is drawn.
 *
 * Kept in `lib/data` for the reason `display-title.ts` gives: the card, the
 * entry header, the dice dialog and the tests all need it, and none of them
 * need the server code a component module would drag in.
 */

/**
 * The two covers, structurally.
 *
 * `cover_url` is optional so a view built without it — a collection item,
 * which has no `user_entries` row to read — falls back to the catalog's cover
 * rather than failing to type-check.
 */
export type CoverFields = {
  cover_url?: string | null;
  media_titles: { main_picture_url: string | null };
};

/** The poster to show: the reader's choice, else the catalog's. */
export function entryCover(entry: CoverFields): string | null {
  return entry.cover_url || entry.media_titles.main_picture_url;
}

/** Where a candidate poster came from, which is what the picker labels it by. */
export type PosterSource = "catalog" | "myanimelist" | "anilist" | "custom";

export type PosterOption = { url: string; source: PosterSource };

/** How a candidate is announced in the picker. */
export const POSTER_SOURCE_LABELS: Record<PosterSource, string> = {
  catalog: "Default",
  myanimelist: "MyAnimeList",
  anilist: "AniList",
  custom: "Custom",
};

/**
 * Every poster the picker can offer, deduplicated by URL, in a stable order:
 * the catalog's own first (it is what "reset" goes back to), then
 * MyAnimeList's gallery, then AniList's cover, then the reader's current
 * custom choice when it is none of those.
 *
 * Any of the live lists may be empty — a site that could not be reached, or a
 * title only one of them has — and the picker still works with what is left.
 */
export function posterOptions({
  catalog,
  current,
  myanimelist = [],
  anilist = [],
}: {
  catalog: string | null;
  current: string | null;
  myanimelist?: (string | null | undefined)[];
  anilist?: (string | null | undefined)[];
}): PosterOption[] {
  const seen = new Set<string>();
  const options: PosterOption[] = [];

  const add = (url: string | null | undefined, source: PosterSource) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    options.push({ url, source });
  };

  add(catalog, "catalog");
  for (const url of myanimelist) add(url, "myanimelist");
  for (const url of anilist) add(url, "anilist");
  add(current, "custom");

  return options;
}

/**
 * A poster URL a reader may save: https only, and no longer than the column
 * allows. Mirrors the `user_entries_cover_url_https` check, so a bad paste is
 * answered with a message rather than a database error.
 *
 * https because the app is served over it — a plain-http image is mixed
 * content, which browsers block, and would only ever show as a broken cover.
 */
export function isPosterUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
