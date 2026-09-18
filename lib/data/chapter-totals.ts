/**
 * How many chapters a title has according to MyAnimeList, and whether that
 * number is finished growing.
 *
 * Kept in `lib/data` rather than beside the source form for the same reason as
 * `source-links.ts`: the form module imports the server actions it submits, so
 * anything importing it inherits that graph. The entry page, the library card
 * and the tests all need this and none of them need the actions.
 */

/**
 * The catalog fields this reads, structurally.
 *
 * Declared here rather than imported from `entries.ts` so client components can
 * name it without reaching into a `server-only` module — the same trick
 * `SourceAttachment` uses.
 */
export type TitleChapters = {
  num_chapters: number | null;
  mal_status: string | null;
};

/** A usable chapter count, and whether more are still coming. */
export type ChapterTotal = {
  count: number;
  /**
   * True when the series has stopped, so this count is the whole of it.
   * False while it is still publishing, where the count is only "so far".
   */
  final: boolean;
};

/**
 * MAL statuses that mean no further chapters are coming.
 *
 * `on_hiatus` is deliberately absent: a paused series can resume, so its count
 * is not final. Note this is MAL's *upstream* publication status, not the
 * per-source `is_hiatus` flag the user sets — see the hiatus migration.
 */
const SETTLED = new Set(["finished", "discontinued"]);

/**
 * MAL's chapter count for a title, or null when it has none to offer.
 *
 * `num_chapters` is 0 or null for anything MAL has not counted, which is most
 * of an ongoing webtoon library — so both collapse to null here rather than to
 * a total of zero, which would offer to mark zero chapters owned.
 */
export function chapterTotal(
  title: TitleChapters | null | undefined,
): ChapterTotal | null {
  const count = title?.num_chapters;
  if (!count || count <= 0) return null;
  return { count, final: SETTLED.has(title?.mal_status ?? "") };
}

/**
 * What the fill-it-in button says.
 *
 * "so far" is the honest qualifier on a series still publishing: the number is
 * everything released to date, and it will be wrong next month. Saying "all"
 * for both would quietly promise something MAL cannot know.
 */
export function ownAllLabel(total: ChapterTotal): string {
  return total.final
    ? `Own all ${total.count}`
    : `Own all ${total.count} so far`;
}

/**
 * How the entry page reports a count it has been given.
 *
 * Four cases, because a bare "40 chapters owned" throws away the one number
 * that makes it mean something:
 *
 *   - no total          — nothing to compare against, so just the count
 *   - owned > total     — MAL's count is behind; "45 of 41" reads as a bug, so
 *                         the ratio is dropped rather than printed wrong
 *   - owned = a final total — the whole series, which is worth saying plainly
 *   - otherwise         — "40 of 179", the useful form
 */
export function ownedCountLabel(
  owned: number,
  total: ChapterTotal | null,
  /**
   * Where the count applies. A parameter rather than two functions because
   * only the last two words differ, and rather than the caller patching the
   * string, because a label that gets edited by a regex breaks silently the
   * day its wording changes.
   */
  scope: "here" | "in total" = "here",
): string {
  if (!total || owned > total.count) return `${owned} chapters owned ${scope}`;
  if (total.final && owned === total.count) {
    return `All ${total.count} chapters owned ${scope}`;
  }
  return `${owned} of ${total.count} chapters owned ${scope}`;
}
