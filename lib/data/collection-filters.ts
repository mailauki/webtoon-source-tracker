/**
 * What the category pages' filter chips mean.
 *
 * The sibling of `selectCandidates` in pick-random.ts, which does the same job
 * for the library. Deliberately a separate function rather than a shared one:
 * the two operate on different shapes (a `LibraryRow` the shelf query built,
 * versus a `CollectionItem` whose tracked half may be absent entirely) and
 * answer a different question. The library asks "which of my titles", where a
 * category page asks "which of these titles are mine" — and that inversion is
 * the whole reason the `library` filter below exists and has no counterpart on
 * the shelf.
 *
 * Kept in `lib/data` rather than beside the chips for the reason
 * `collection-items.ts` gives: the filter bar is a client component and the
 * tests need this directly, and neither wants the server actions a component
 * module drags in.
 */

import type { CollectionItem } from "@/lib/data/collection-items";

/**
 * Whether a title has to be on the viewer's shelf, off it, or either.
 *
 * The primary axis on a discovery page, and the one that makes the other two
 * coherent: status and source only exist for a tracked title, so narrowing by
 * either is implicitly asking about the library half. Naming that explicitly
 * means "Reading" can mean what it says instead of silently also meaning
 * "and in my library".
 */
export type LibraryFilter = "" | "tracked" | "untracked";

export type CollectionFilterState = {
  /** "" is the All chip — see resolveActiveChip for why that spelling. */
  library: LibraryFilter;
  status: string;
  source: string;
};

export const NO_COLLECTION_FILTERS: CollectionFilterState = {
  library: "",
  status: "",
  source: "",
};

/** Whether anything is narrowed. Drives the "Clear all" item and the badge. */
export function anyCollectionFilter(state: CollectionFilterState): boolean {
  return Boolean(state.library || state.status || state.source);
}

/**
 * The items the active chips leave visible.
 *
 * Status and source are questions about a tracked entry, so an untracked item
 * cannot satisfy either and is dropped when one is set. That is the behaviour
 * the alternative gets wrong: leaving untracked titles visible under a
 * "Reading" filter would show titles the viewer has never opened, which reads
 * as the filter being broken rather than as a deliberate mixed view.
 *
 * It also means `library: "untracked"` and a status together select nothing,
 * which is correct and not worth special-casing — the empty state says the
 * filters hid everything, and the two chips visibly disagree.
 */
export function filterCollectionItems(
  items: CollectionItem[],
  { library, status, source }: CollectionFilterState,
): CollectionItem[] {
  return items.filter((item) => {
    const tracked = item.tracked;

    if (library === "tracked" && !tracked) return false;
    if (library === "untracked" && tracked) return false;

    // Both of these are facts about an entry. No entry, no match — see above.
    if (status) {
      if (!tracked || tracked.listStatus !== status) return false;
    }

    if (source === "none") {
      // "No source" means a title that is tracked but has nowhere recorded —
      // the gap this app exists to surface. An untracked title is not that:
      // it is a title with no entry at all, which `library` asks about.
      return Boolean(tracked) && tracked!.sourceSlugs.length === 0;
    }
    if (source) {
      if (!tracked || !tracked.sourceSlugs.includes(source)) return false;
    }

    return true;
  });
}
