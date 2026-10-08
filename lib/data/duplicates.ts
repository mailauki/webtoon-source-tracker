import { kindsCompatible, nameKeys } from "./cross-search";

/** The fields a library row needs for duplicate matching. */
export type DuplicateRow = {
  id: number;
  media_titles: {
    mal_media_id: number | null;
    anilist_media_id: number | null;
    title: string;
    title_en: string | null;
    alt_titles?: string[] | null;
    mal_media_kind: string | null;
  };
};

/** An AniList-only entry and the MyAnimeList entry it looks like. */
export type DuplicatePair<Row extends DuplicateRow = DuplicateRow> = {
  anilist: Row;
  mal: Row;
};

/**
 * Library entries that look like one work held twice: an AniList-only title
 * and a MyAnimeList title that has no AniList id, matched by name.
 *
 * These are the duplicates the automatic merge cannot see, because neither
 * row carries the other's id. The rule is the one the catalog search already
 * trusts to link the two sites (see mergeResults): an identical name once
 * case, accents and spacing are ignored, compatible kinds, and exactly one
 * candidate on each side. Anything looser stays two titles — merging moves
 * every user's entries, so a wrong pair is worse than a missed one.
 */
export function findDuplicates<Row extends DuplicateRow>(
  rows: Row[],
): DuplicatePair<Row>[] {
  const malByKey = new Map<string, Row[]>();
  for (const row of rows) {
    const t = row.media_titles;
    if (t.mal_media_id === null || t.anilist_media_id !== null) continue;
    for (const key of nameKeys({ ...t, alt_titles: t.alt_titles ?? [] })) {
      malByKey.set(key, [...(malByKey.get(key) ?? []), row]);
    }
  }

  const pairs: DuplicatePair<Row>[] = [];
  const claims = new Map<number, number>();

  for (const row of rows) {
    const t = row.media_titles;
    if (t.mal_media_id !== null || t.anilist_media_id === null) continue;

    const candidates = new Set<Row>();
    let ambiguous = false;
    for (const key of nameKeys({ ...t, alt_titles: t.alt_titles ?? [] })) {
      const compatible = (malByKey.get(key) ?? []).filter((mal) =>
        kindsCompatible(mal.media_titles.mal_media_kind, t.mal_media_kind),
      );
      if (compatible.length > 1) ambiguous = true;
      for (const mal of compatible) candidates.add(mal);
    }
    if (ambiguous || candidates.size !== 1) continue;

    const [mal] = candidates;
    claims.set(mal.id, (claims.get(mal.id) ?? 0) + 1);
    pairs.push({ anilist: row, mal });
  }

  // Two AniList-only titles pointing at one MyAnimeList title is ambiguity.
  return pairs.filter((pair) => claims.get(pair.mal.id) === 1);
}
