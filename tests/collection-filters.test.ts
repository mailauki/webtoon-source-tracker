/**
 * What the category pages' chips select.
 *
 * The interesting cases all come from the same asymmetry: a category page
 * shows catalog titles, and status and source are facts about a *tracked*
 * entry. Most items on a curated shelf have neither, so what the filters do
 * to those is the whole design — see collection-filters.ts.
 */
import { describe, expect, it } from "vitest";

import {
  anyCollectionFilter,
  filterCollectionItems,
  NO_COLLECTION_FILTERS,
  type CollectionFilterState,
} from "@/lib/data/collection-filters";
import type { CollectionItem } from "@/lib/data/collection-items";

/**
 * One item. `tracked` null is an untracked catalog title — the common case on
 * a curated shelf, and the one every filter has to have an answer for.
 */
function item(
  id: number,
  tracked: { listStatus: string; sourceSlugs: string[] } | null = null,
): CollectionItem {
  return {
    id,
    position: id,
    note: null,
    media_titles: { id: id * 10, title: `Title ${id}` },
    entryId: tracked ? id * 100 : null,
    tracked: tracked ? { entryId: id * 100, ...tracked } : null,
  } as unknown as CollectionItem;
}

const filters = (patch: Partial<CollectionFilterState>) => ({
  ...NO_COLLECTION_FILTERS,
  ...patch,
});

const ids = (items: CollectionItem[]) => items.map((i) => i.id);

const SHELF = [
  item(1), // untracked
  item(2, { listStatus: "reading", sourceSlugs: ["tapas"] }),
  item(3, { listStatus: "completed", sourceSlugs: ["webtoon", "tapas"] }),
  item(4), // untracked
  item(5, { listStatus: "reading", sourceSlugs: [] }), // tracked, no source
];

describe("no filters", () => {
  it("shows the whole category", () => {
    expect(ids(filterCollectionItems(SHELF, NO_COLLECTION_FILTERS))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("reports nothing as narrowed", () => {
    expect(anyCollectionFilter(NO_COLLECTION_FILTERS)).toBe(false);
    expect(anyCollectionFilter(filters({ library: "tracked" }))).toBe(true);
    expect(anyCollectionFilter(filters({ status: "reading" }))).toBe(true);
    expect(anyCollectionFilter(filters({ source: "tapas" }))).toBe(true);
  });
});

describe("the library filter", () => {
  it("selects only what the viewer tracks", () => {
    const got = filterCollectionItems(SHELF, filters({ library: "tracked" }));
    expect(ids(got)).toEqual([2, 3, 5]);
  });

  /**
   * The other half, and the reason this filter exists: "what on this shelf
   * haven't I got" is the question a discovery page is being asked.
   */
  it("selects only what they do not", () => {
    const got = filterCollectionItems(SHELF, filters({ library: "untracked" }));
    expect(ids(got)).toEqual([1, 4]);
  });
});

describe("status and source narrow the tracked half", () => {
  /**
   * The behaviour the alternative gets wrong. Leaving untracked titles
   * visible under "Reading" would show titles the viewer has never opened,
   * which reads as the filter being broken.
   */
  it("drops untracked titles when a status is set", () => {
    const got = filterCollectionItems(SHELF, filters({ status: "reading" }));
    expect(ids(got)).toEqual([2, 5]);
  });

  it("drops untracked titles when a source is set", () => {
    const got = filterCollectionItems(SHELF, filters({ source: "tapas" }));
    expect(ids(got)).toEqual([2, 3]);
  });

  it("matches a title on any of its attached sources, not just the first", () => {
    const got = filterCollectionItems(SHELF, filters({ source: "webtoon" }));
    expect(ids(got)).toEqual([3]);
  });

  it("intersects status and source rather than widening", () => {
    const got = filterCollectionItems(
      SHELF,
      filters({ status: "completed", source: "tapas" }),
    );
    expect(ids(got)).toEqual([3]);
  });
});

describe('the "No source" chip', () => {
  /**
   * The gap this whole app exists to surface: a title on the shelf with
   * nowhere recorded to read it.
   */
  it("finds tracked titles with nothing attached", () => {
    const got = filterCollectionItems(SHELF, filters({ source: "none" }));
    expect(ids(got)).toEqual([5]);
  });

  /**
   * An untracked title also has no sources, but it is not the same thing —
   * it has no entry at all, which is what the library filter asks about.
   * Conflating them would fill this chip with the rest of the catalog.
   */
  it("does not sweep in untracked titles, which have no entry at all", () => {
    const got = filterCollectionItems(SHELF, filters({ source: "none" }));
    expect(ids(got)).not.toContain(1);
    expect(ids(got)).not.toContain(4);
  });
});

describe("contradictory selections", () => {
  /**
   * Selecting nothing is correct here and deliberately not special-cased: the
   * two chips visibly disagree, and the empty state says the filters hid
   * everything.
   */
  it("selects nothing for untracked plus a status", () => {
    const got = filterCollectionItems(
      SHELF,
      filters({ library: "untracked", status: "reading" }),
    );
    expect(got).toEqual([]);
  });

  it("selects nothing for a status no tracked title has", () => {
    const got = filterCollectionItems(SHELF, filters({ status: "dropped" }));
    expect(got).toEqual([]);
  });
});

describe("a category with nothing tracked", () => {
  const UNTRACKED = [item(1), item(2)];

  it("is untouched by the all-titles and untracked chips", () => {
    expect(ids(filterCollectionItems(UNTRACKED, NO_COLLECTION_FILTERS))).toEqual(
      [1, 2],
    );
    expect(
      ids(filterCollectionItems(UNTRACKED, filters({ library: "untracked" }))),
    ).toEqual([1, 2]);
  });

  it("is emptied by any filter that asks about an entry", () => {
    expect(
      filterCollectionItems(UNTRACKED, filters({ library: "tracked" })),
    ).toEqual([]);
    expect(
      filterCollectionItems(UNTRACKED, filters({ status: "reading" })),
    ).toEqual([]);
  });
});
