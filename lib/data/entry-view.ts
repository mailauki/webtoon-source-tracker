/**
 * What a card or a row needs to draw one title, from either side of the app.
 *
 * Two shapes reach the same surfaces. The library hands over a `LibraryRow` —
 * an entry the viewer tracks, with a status, a chapter count and attached
 * sources. A collection or a tag page hands over a catalog title that the
 * viewer may not track at all, whose only meaningful action is "add it".
 *
 * They used to have a component each (EntryCard and CollectionCard), which
 * meant two cover treatments, two title clamps and two sets of badges drifting
 * apart one fix at a time. This is the join: both normalise into one view
 * model, and the card branches on `entry === null` in the few places the two
 * genuinely differ rather than everywhere they happen to look alike.
 *
 * Deliberately not `server-only`. The cards are client components and the
 * tests call these directly — the same reason `rank-sources.ts` and
 * `source-links.ts` sit in this directory rather than beside their consumers.
 */

import { ownsEveryChapter } from "@/lib/data/chapter-ranges";
import { chapterTotal } from "@/lib/data/chapter-totals";
import { displayTitle } from "@/lib/data/display-title";
import type { CollectionItem } from "@/lib/data/collection-items";
import type { LibraryRow } from "@/lib/data/entries";
import { isMature } from "@/lib/data/nsfw";
import { isOnHiatus } from "@/lib/data/pick-random";
import { readingLink } from "@/lib/data/source-links";

/** The tracked half — everything that only exists once a title is on a shelf. */
export type TrackedView = {
  /** `user_entries.id`, which is what /entry/[id] is keyed on. */
  id: number;
  listStatus: string;
  chaptersRead: number;
  /** Percent read, or null when the total is unknown (most ongoing series). */
  pct: number | null;
  /** How many chapters are left, or null when that cannot be known. */
  remaining: number | null;
  onHiatus: boolean;
  /** Owning the series outright — see ownsEveryChapter, not partial ownership. */
  ownedOutright: boolean;
  /** The attached sources, primary first. */
  sources: LibraryRow["entry_sources"];
  /** Where to read it, if any attachment carries a URL. */
  readAt: ReturnType<typeof readingLink<LibraryRow["entry_sources"][number]>>;
  /** The full row, for the menu, the sheet and the source dialog. */
  row: LibraryRow;
};

export type EntryView = {
  /** React key, and stable across both shapes: the catalog row's id. */
  titleId: number;
  /** English where MAL has one. The heading AND the accessible name. */
  name: string;
  coverUrl: string | null;
  malMediaId: number;
  /** MAL's chapter count, which the source dialog's "own all" divides by. */
  malTotal: ReturnType<typeof chapterTotal>;
  /** The raw catalog count the progress bar divides by. May be 0 or null. */
  total: number | null;
  mature: boolean;
  /**
   * Null for a catalog title the viewer does not track — which is the
   * interesting case on a curated shelf, and the branch every "is this mine"
   * question in the card reads.
   */
  entry: TrackedView | null;
  /**
   * Where the card links, or null when it links nowhere.
   *
   * Null is not the same question as `entry === null`. A collection item the
   * viewer tracks has an entry page to link to but carries none of the
   * tracked furniture, and an untracked one has no page at all — so the link
   * and the progress numbers are decided separately.
   */
  entryHref: string | null;
  /** The editorial line under a curated card, when the shelf has one. */
  note: string | null;
};

/** Percent read, clamped. Null when there is no total to divide by. */
function percent(read: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((read / total) * 100));
}

/** One tracked entry, as a card or a row needs it. */
export function entryView(row: LibraryRow): EntryView {
  const title = row.media_titles;
  // Primary first, so the most relevant pill is never the one truncated.
  const sources = [...row.entry_sources].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  const malTotal = chapterTotal(title);
  const total = title.num_chapters;

  return {
    titleId: title.id,
    name: displayTitle(title),
    coverUrl: title.main_picture_url,
    malMediaId: title.mal_media_id,
    malTotal,
    total,
    mature: isMature(title),
    entryHref: `/entry/${row.id}`,
    note: null,
    entry: {
      id: row.id,
      listStatus: row.list_status,
      chaptersRead: row.num_chapters_read,
      pct: percent(row.num_chapters_read, total),
      remaining:
        total && total > 0 ? Math.max(0, total - row.num_chapters_read) : null,
      onHiatus: isOnHiatus(row),
      ownedOutright: ownsEveryChapter(sources, malTotal),
      sources,
      readAt: readingLink(sources),
      row,
    },
  };
}

/**
 * One collection item, as the same card needs it.
 *
 * `entryId` is the join the collection query already does: non-null means the
 * viewer tracks this title, and the card links to the entry instead of
 * offering to add it. But a collection item carries only the catalog row — no
 * status, no progress, no sources — so even a tracked title arrives here with
 * `entry: null`. The card reads `entryHref` for the link and leaves the
 * tracked furniture off, which is correct: this surface never had those
 * numbers to show.
 */
export function collectionView(item: CollectionItem): EntryView {
  const title = item.media_titles;

  return {
    titleId: title.id,
    name: displayTitle(title),
    coverUrl: title.main_picture_url,
    malMediaId: title.mal_media_id,
    malTotal: chapterTotal(title),
    total: title.num_chapters,
    mature: isMature(title),
    entryHref: item.entryId !== null ? `/entry/${item.entryId}` : null,
    note: item.note,
    entry: null,
  };
}
