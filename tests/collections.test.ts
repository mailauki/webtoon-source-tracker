import { describe, expect, it } from "vitest";

import {
  hydrateCollection,
  nextPosition,
  summariseCollection,
  SUMMARY_COVER_COUNT,
  type RawCollection,
  type RawCollectionItem,
} from "@/lib/data/collection-items";

function item(
  id: number,
  position: number,
  titleId = id * 100,
): RawCollectionItem {
  return {
    id,
    position,
    note: null,
    media_titles: {
      id: titleId,
      mal_media_id: titleId + 1,
      title: `Title ${titleId}`,
      title_en: null,
      main_picture_url: null,
      mal_media_kind: "manhwa",
      num_chapters: null,
      mal_status: "currently_publishing",
    },
  };
}

/** `item`, but with artwork — the covers a summary previews. */
function covered(
  id: number,
  position: number,
  titleId = id * 100,
): RawCollectionItem {
  const row = item(id, position, titleId);
  return {
    ...row,
    media_titles: {
      ...row.media_titles,
      main_picture_url: `https://example.test/${titleId}.jpg`,
    },
  };
}

function collection(items: RawCollectionItem[]): RawCollection {
  return {
    id: 1,
    slug: "starter-manhwa",
    name: "Where to start",
    description: "The ones everyone recommends.",
    collection_items: items,
  };
}

describe("hydrateCollection", () => {
  it("orders items by position, not by the order they arrive in", () => {
    const result = hydrateCollection(
      collection([item(1, 30), item(2, 10), item(3, 20)]),
      new Map(),
    );

    expect(result.items.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("breaks ties on id, since position is deliberately not unique", () => {
    // Reordering rewrites every position in one statement, so a shelf can sit
    // at a shared position between writes. Insertion order decides.
    const result = hydrateCollection(
      collection([item(9, 10), item(4, 10), item(7, 10)]),
      new Map(),
    );

    expect(result.items.map((i) => i.id)).toEqual([4, 7, 9]);
  });

  it("stitches in the viewer's entry id, not the catalog id", () => {
    // /entry/[id] is keyed on user_entries. Handing it a title id would route
    // to another user's entry or to a 404.
    const tracked = new Map([[200, 55]]);
    const result = hydrateCollection(
      collection([item(1, 10, 100), item(2, 20, 200)]),
      tracked,
    );

    expect(result.items.map((i) => i.entryId)).toEqual([null, 55]);
  });

  it("leaves every entryId null when the viewer tracks nothing", () => {
    const result = hydrateCollection(
      collection([item(1, 10), item(2, 20)]),
      new Map(),
    );

    expect(result.items.every((i) => i.entryId === null)).toBe(true);
  });

  it("trims to a shelf's worth, keeping the lowest positions", () => {
    const result = hydrateCollection(
      collection([item(1, 40), item(2, 10), item(3, 30), item(4, 20)]),
      new Map(),
      2,
    );

    expect(result.items.map((i) => i.id)).toEqual([2, 4]);
  });

  it("keeps everything when no limit is given", () => {
    const result = hydrateCollection(
      collection([item(1, 10), item(2, 20), item(3, 30)]),
      new Map(),
    );

    expect(result.items).toHaveLength(3);
  });

  it("does not mutate the rows it was handed", () => {
    const rows = [item(1, 30), item(2, 10)];
    const source = collection(rows);

    hydrateCollection(source, new Map());

    expect(source.collection_items.map((i) => i.id)).toEqual([1, 2]);
  });

  it("carries the collection's own fields through, without its raw items", () => {
    const result = hydrateCollection(collection([item(1, 10)]), new Map());

    expect(result).toMatchObject({
      id: 1,
      slug: "starter-manhwa",
      name: "Where to start",
      description: "The ones everyone recommends.",
    });
    expect(result).not.toHaveProperty("collection_items");
  });

  it("survives a collection with no items", () => {
    const result = hydrateCollection(collection([]), new Map());

    expect(result.items).toEqual([]);
  });
});

describe("summariseCollection", () => {
  it("counts every item, even beyond the covers it shows", () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      covered(i + 1, (i + 1) * 10),
    );
    const result = summariseCollection(collection(items));

    expect(result.itemCount).toBe(7);
    expect(result.covers).toHaveLength(SUMMARY_COVER_COUNT);
  });

  it("previews the same titles the detail page shows first", () => {
    // A card that previewed a different four would read as a different
    // collection, so the ordering here has to match hydrateCollection's.
    const rows = [covered(1, 30), covered(2, 10), covered(3, 20)];

    const summary = summariseCollection(collection(rows));
    const detail = hydrateCollection(collection(rows), new Map());

    expect(summary.covers).toEqual(
      detail.items.map((i) => i.media_titles.main_picture_url),
    );
  });

  it("drops titles with no cover rather than leaving a gap", () => {
    const result = summariseCollection(collection([covered(1, 10), item(2, 20)]));

    expect(result.covers).toEqual(["https://example.test/100.jpg"]);
    // The coverless title still counts — it is in the collection.
    expect(result.itemCount).toBe(2);
  });

  it("handles an empty collection", () => {
    const result = summariseCollection(collection([]));

    expect(result).toMatchObject({ itemCount: 0, covers: [] });
  });
});

describe("nextPosition", () => {
  it("starts at ten, leaving room to insert ahead of the first item", () => {
    expect(nextPosition([])).toBe(10);
  });

  it("appends past the end, spaced for manual insertion", () => {
    expect(nextPosition([10, 20, 30])).toBe(40);
  });

  it("goes past the highest position, not the last one handed in", () => {
    // The query that feeds this does not order, so it must not assume it.
    expect(nextPosition([30, 10, 20])).toBe(40);
  });

  it("survives the duplicate positions a lost race can leave behind", () => {
    expect(nextPosition([10, 10, 20])).toBe(30);
  });
});
