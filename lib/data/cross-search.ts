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

import { normalizeTitle as normalizeName } from "@/lib/data/search";

/** A MyAnimeList hit, reduced to the fields a merge compares. */
export type MalHit = {
  mal_media_id: number;
  title: string;
  title_en: string | null;
  /** Every other name MAL has for it. Only read to line up a missing idMal. */
  alt_titles?: string[];
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
  /** Native-script title and synonyms. See MalHit's. */
  alt_titles?: string[];
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
  /**
   * How a "both" row was lined up: AniList's own `idMal`, or — when AniList
   * recorded none — an exact name match. See mergeResults. Null on a row only
   * one catalog had.
   */
  matched_on: "mal_id" | "title" | null;
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
 * The name keys a hit can be lined up on: every title it has, normalized and
 * with spaces removed. A key under four characters is dropped — "Love" or
 * "Oz" are one title's name on one site and another's on the other, and a
 * native-script title that short is rare enough not to be worth the risk.
 */
function nameKeys(hit: {
  title: string;
  title_en: string | null;
  alt_titles?: string[];
}): Set<string> {
  const keys = new Set<string>();
  for (const name of [hit.title, hit.title_en, ...(hit.alt_titles ?? [])]) {
    if (!name) continue;
    const key = normalizeName(name).replaceAll(" ", "");
    if ([...key].length >= 4) keys.add(key);
  }
  return keys;
}

/**
 * Whether two catalogs' kinds allow them to be one title.
 *
 * Both sides are already in MAL's vocabulary (the route maps AniList's
 * format and country through toMalMediaKind), so this is equality — with the
 * one exception that MAL splits prose into `novel` and `light_novel` where
 * AniList has only NOVEL. A missing kind on either side is a refusal, not a
 * pass: the kind check is what keeps a novel from fusing with its own
 * adaptation, which share every name.
 */
function kindsCompatible(mal: string | null, anilist: string | null): boolean {
  if (!mal || !anilist) return false;
  const prose = (kind: string) => kind === "novel" || kind === "light_novel";
  if (prose(mal) || prose(anilist)) return prose(mal) && prose(anilist);
  return mal === anilist;
}

/**
 * Merges the two result sets into one ordered list.
 *
 * Titles are matched on AniList's `idMal` first. That link is AniList's own
 * statement that the two entries are one title, so it is trusted whatever the
 * names say.
 *
 * AniList often records no `idMal` at all, most of all for recent manhwa, and
 * a title then showed twice — once per site. For those hits only, a name match
 * is the fallback, and it is deliberately strict, because the failure mode is
 * silently fusing two different titles into one row, which hides that anything
 * was conflated (and would cache the wrong AniList id on add). A hit merges
 * only when all of these hold:
 *
 * - some name is identical on both sides once case, accents, punctuation and
 *   spacing are ignored — no typo tolerance. Every name counts, including the
 *   native-script one, which is the most reliable: English names for the same
 *   manhwa vary by translator, the Korean title does not;
 * - the kinds agree — see kindsCompatible. A novel never merges with its
 *   manhwa;
 * - the name identifies exactly one eligible MAL hit. Two MAL rows sharing a
 *   name is ambiguity, and ambiguity stays as separate rows;
 * - that MAL hit is not already taken, by an idMal link or an earlier
 *   AniList hit. AniList's relevance order decides between two claimants.
 *
 * A hit whose `idMal` points somewhere else is left alone: AniList said which
 * title it is, and second-guessing it by name is how a spin-off fuses with
 * its parent.
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
  const links = new Map<number, { hit: AniListHit; on: "mal_id" | "title" }>();
  for (const hit of anilistHits) {
    // First wins: AniList occasionally has two entries claiming one MAL id,
    // and its relevance order makes the first the better guess.
    if (hit.mal_media_id !== null && !links.has(hit.mal_media_id)) {
      links.set(hit.mal_media_id, { hit, on: "mal_id" });
    }
  }

  // The name fallback, for hits AniList gave no idMal. Built only over MAL
  // hits nothing has claimed by id, so a name can never pull a title away
  // from the one AniList itself linked it to.
  const malByKey = new Map<string, MalHit[]>();
  for (const hit of malHits) {
    if (links.has(hit.mal_media_id)) continue;
    for (const key of nameKeys(hit)) {
      const list = malByKey.get(key);
      if (list) list.push(hit);
      else malByKey.set(key, [hit]);
    }
  }

  for (const hit of anilistHits) {
    if (hit.mal_media_id !== null) continue;

    const candidates = new Set<MalHit>();
    let ambiguous = false;
    for (const key of nameKeys(hit)) {
      const compatible = (malByKey.get(key) ?? []).filter((m) =>
        kindsCompatible(m.media_kind, hit.media_kind),
      );
      if (compatible.length > 1) ambiguous = true;
      for (const m of compatible) candidates.add(m);
    }

    // One name pointing at two MAL rows, or two names at two different ones:
    // either way this hit could be more than one title.
    if (ambiguous || candidates.size !== 1) continue;
    const [match] = candidates;
    if (links.has(match.mal_media_id)) continue;

    links.set(match.mal_media_id, { hit, on: "title" });
  }

  const matched = new Set<number>();
  const merged: MergedResult[] = [];

  for (const mal of malHits) {
    const link = links.get(mal.mal_media_id) ?? null;
    const anilist = link?.hit ?? null;
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
      matched_on: link?.on ?? null,
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
      matched_on: null,
    });
  }

  return merged;
}

/**
 * The pairs a merge lined up by name alone: the two ids of every "both" row
 * matched on title rather than on AniList's own `idMal`.
 *
 * These are the links nothing else in the app can find. The mirror, the
 * syncs and the entry page all reach AniList by MAL id (`idMal`), and AniList
 * does not have one for these titles, so each of those lookups comes back
 * empty. Saving the pair onto the catalog row — see rememberNameMatches — is
 * what lets them use the AniList id directly instead.
 */
export function nameMatchedLinks(
  results: MergedResult[],
): { malMediaId: number; anilistMediaId: number }[] {
  return results.flatMap((row) =>
    row.matched_on === "title" &&
    row.mal_media_id !== null &&
    row.anilist_media_id !== null
      ? [{ malMediaId: row.mal_media_id, anilistMediaId: row.anilist_media_id }]
      : [],
  );
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

/**
 * How many library rows have never been matched to an AniList title.
 *
 * Drives the notice on /library. The Sync button there only ever pulls —
 * MyAnimeList into the app, AniList into the app — while copying the library
 * *out* to AniList is a bulk write that lives behind the confirmation dialog
 * on /settings. Without this count the button quietly does half of what
 * "sync" sounds like, and someone who expected their MyAnimeList list to show
 * up on AniList has no way to find out why it did not.
 *
 * A row counts as unmatched when it has no `anilist_media_id`, which is the
 * same handle mirrorToAniList and the account sync fill in — so this shrinks
 * on its own as titles get copied, and reaches zero exactly when there is
 * nothing left to push.
 *
 * Takes the rows the page already has rather than running its own query, and
 * is deliberately null-tolerant: `media_titles` is an inner join in practice,
 * but a caller passing a partial row should get a count, not a crash.
 */
export function countUnmatchedToAniList(
  rows: { media_titles?: { anilist_media_id?: number | null } | null }[],
): number {
  return rows.filter((row) => row.media_titles?.anilist_media_id == null).length;
}
