/**
 * Lining up one search across MyAnimeList and AniList.
 *
 * The two catalogs describe the same titles differently, so a merged result
 * has to answer three questions per row: is this title on both sites, do they
 * agree about it, and if not, where. This module is the pure half of that —
 * no fetching, no server imports — so the rule for "the same title" and the
 * rule for "a real disagreement" are testable on their own and cannot drift
 * between the route handler and anything else that merges these later.
 */

/** A MyAnimeList hit, reduced to the fields a merge compares. */
export type MalHit = {
  mal_media_id: number;
  title: string;
  title_en: string | null;
  main_picture_url: string | null;
  media_kind: string | null;
  num_chapters: number | null;
  num_volumes: number | null;
  mal_status: string | null;
};

/** An AniList hit, in the same reduced shape. */
export type AniListHit = {
  anilist_media_id: number;
  /** Null when AniList has no MyAnimeList counterpart recorded. */
  mal_media_id: number | null;
  title: string;
  title_en: string | null;
  main_picture_url: string | null;
  media_kind: string | null;
  num_chapters: number | null;
  num_volumes: number | null;
  anilist_status: string | null;
};

/** Which catalogs a merged row was found in. */
export type MergedSource = "both" | "mal" | "anilist";

/** A field the two sites disagree about. */
export type Mismatch = {
  field: "title_en" | "chapters" | "volumes";
  mal: string | number | null;
  anilist: string | number | null;
};

export type MergedResult = {
  /** Stable across renders: the MAL id where there is one, else the AniList id. */
  key: string;
  source: MergedSource;
  mal_media_id: number | null;
  anilist_media_id: number | null;
  title: string;
  title_en: string | null;
  main_picture_url: string | null;
  media_kind: string | null;
  num_chapters: number | null;
  num_volumes: number | null;
  /** Empty unless `source` is "both" — one catalog cannot contradict itself. */
  mismatches: Mismatch[];
};

/**
 * Whether two titles are the same string for comparison purposes.
 *
 * Case, surrounding space and punctuation are all noise here: "Re:Zero" and
 * "Re Zero" are the same English title recorded by two sites with different
 * house styles, and flagging that as a mismatch would bury the disagreements
 * that actually mean something. Only letters and digits survive.
 */
function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Compares the two sites on the fields they both record.
 *
 * Deliberately conservative: a field is only a mismatch when BOTH sites have a
 * value and the values differ. A null on either side means "not recorded", not
 * "recorded as zero" — AniList leaves `chapters` null for anything still
 * running, and treating that as a disagreement with MAL's running count would
 * flag every ongoing series on the page, which is most of them.
 *
 * `status` is not compared at all, for the same reason at a larger scale: the
 * two sites use different vocabularies ("currently_publishing" vs "RELEASING")
 * and mapping between them is guesswork that would produce noise, not signal.
 */
export function findMismatches(mal: MalHit, anilist: AniListHit): Mismatch[] {
  const mismatches: Mismatch[] = [];

  if (
    mal.title_en &&
    anilist.title_en &&
    normalizeTitle(mal.title_en) !== normalizeTitle(anilist.title_en)
  ) {
    mismatches.push({
      field: "title_en",
      mal: mal.title_en,
      anilist: anilist.title_en,
    });
  }

  if (
    mal.num_chapters !== null &&
    anilist.num_chapters !== null &&
    // Zero is MAL's way of saying "unknown", not a real count of no chapters.
    mal.num_chapters > 0 &&
    anilist.num_chapters > 0 &&
    mal.num_chapters !== anilist.num_chapters
  ) {
    mismatches.push({
      field: "chapters",
      mal: mal.num_chapters,
      anilist: anilist.num_chapters,
    });
  }

  if (
    mal.num_volumes !== null &&
    anilist.num_volumes !== null &&
    mal.num_volumes > 0 &&
    anilist.num_volumes > 0 &&
    mal.num_volumes !== anilist.num_volumes
  ) {
    mismatches.push({
      field: "volumes",
      mal: mal.num_volumes,
      anilist: anilist.num_volumes,
    });
  }

  return mismatches;
}

/**
 * Merges the two result sets into one ordered list.
 *
 * Titles are matched on AniList's `idMal` and nothing else. Fuzzy title
 * matching was considered and left out: the failure mode is silently merging
 * two different titles into one row — a spin-off with its parent series, a
 * novel with its adaptation — which is worse than showing them separately,
 * because a merged row hides that anything was conflated. An AniList hit with
 * no `idMal` is reported as AniList-only, which is honest and still useful.
 *
 * Ordering follows MAL's relevance order first, then AniList-only hits in
 * theirs. Both sites sort by match quality, but their scores are not
 * comparable, so interleaving them would be inventing a ranking. Leading with
 * MAL keeps the order the page had before AniList was added to it.
 *
 * MAL-side display values win on a merged row: the library is keyed on MAL
 * ids, so what a user sees before adding a title should be what gets stored.
 * The AniList value is not discarded — it rides along in `mismatches`.
 */
export function mergeResults(
  malHits: MalHit[],
  anilistHits: AniListHit[],
): MergedResult[] {
  const byMalId = new Map<number, AniListHit>();
  for (const hit of anilistHits) {
    // First wins: AniList occasionally has two entries claiming one MAL id,
    // and its relevance order makes the first the better guess.
    if (hit.mal_media_id !== null && !byMalId.has(hit.mal_media_id)) {
      byMalId.set(hit.mal_media_id, hit);
    }
  }

  const matched = new Set<number>();
  const merged: MergedResult[] = [];

  for (const mal of malHits) {
    const anilist = byMalId.get(mal.mal_media_id) ?? null;
    if (anilist) matched.add(anilist.anilist_media_id);

    merged.push({
      key: `mal:${mal.mal_media_id}`,
      source: anilist ? "both" : "mal",
      mal_media_id: mal.mal_media_id,
      anilist_media_id: anilist?.anilist_media_id ?? null,
      title: mal.title,
      title_en: mal.title_en,
      main_picture_url: mal.main_picture_url,
      media_kind: mal.media_kind,
      num_chapters: mal.num_chapters,
      num_volumes: mal.num_volumes,
      mismatches: anilist ? findMismatches(mal, anilist) : [],
    });
  }

  for (const anilist of anilistHits) {
    if (matched.has(anilist.anilist_media_id)) continue;
    // An AniList hit whose MAL counterpart exists but fell outside this
    // page of MAL results is still AniList-only *for this search* — saying
    // "both" would claim a MAL row the user cannot see.
    merged.push({
      key: `anilist:${anilist.anilist_media_id}`,
      source: "anilist",
      mal_media_id: anilist.mal_media_id,
      anilist_media_id: anilist.anilist_media_id,
      title: anilist.title,
      title_en: anilist.title_en,
      main_picture_url: anilist.main_picture_url,
      media_kind: anilist.media_kind,
      num_chapters: anilist.num_chapters,
      num_volumes: anilist.num_volumes,
      mismatches: [],
    });
  }

  return merged;
}

/**
 * The `anilist_media_id` fields to include in a catalog upsert.
 *
 * Returns an empty object rather than `{ anilist_media_id: null }` when there
 * is no id to write, and that distinction is the entire point. `media_titles`
 * is a shared catalog: an upsert onto a row another user's mirror already
 * resolved would, with an explicit null, blank a cached id and send every
 * later mirror back to AniList to look it up again. Absent means "leave
 * whatever is there"; present means "this is better than nothing".
 *
 * Split out from the action so the rule is testable without standing up a
 * Supabase client, since the failure it prevents is silent — the write
 * succeeds either way, and the only symptom is extra lookups later.
 */
export function anilistIdPatch(
  anilistMediaId: number | null | undefined,
): { anilist_media_id?: number } {
  return anilistMediaId === undefined || anilistMediaId === null
    ? {}
    : { anilist_media_id: anilistMediaId };
}
