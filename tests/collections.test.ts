import { describe, expect, it } from "vitest";

import {
  collectionMembership,
  collectionsForTitle,
  hydrateCollection,
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

describe("collectionsForTitle", () => {
  const targets = [
    { id: 1, name: "Comfort rereads", titleIds: [10, 20] },
    { id: 2, name: "To recommend", titleIds: [] },
  ];

  it("marks the collections that already hold the title", () => {
    expect(collectionsForTitle(targets, 10)).toEqual([
      { id: 1, name: "Comfort rereads", has: true },
      { id: 2, name: "To recommend", has: false },
    ]);
  });

  it("keeps a collection that has the title rather than dropping it", () => {
    // The menu ticks and disables it. Dropping it would make "already in this
    // collection" indistinguishable from "no such collection".
    expect(collectionsForTitle(targets, 20)).toHaveLength(2);
  });

  it("marks nothing when the title is in none of them", () => {
    expect(collectionsForTitle(targets, 999).every((c) => !c.has)).toBe(true);
  });

  it("returns nothing when the viewer has no collections", () => {
    expect(collectionsForTitle([], 10)).toEqual([]);
  });
});

describe("collectionMembership", () => {
  const targets = [
    {
      id: 1,
      name: "Comfort rereads",
      titleIds: [10],
      items: [{ id: 900, titleId: 10 }],
    },
    { id: 2, name: "To recommend", titleIds: [], items: [] },
  ];

  it("hands back the item id, which is what removing needs", () => {
    expect(collectionMembership(targets, 10)).toEqual([
      { id: 1, name: "Comfort rereads", itemId: 900 },
      { id: 2, name: "To recommend", itemId: null },
    ]);
  });

  it("lists every collection, not only the ones holding the title", () => {
    // The section answers "where could this go" as well as "where is it".
    expect(collectionMembership(targets, 999)).toHaveLength(2);
    expect(collectionMembership(targets, 999).every((m) => m.itemId === null))
      .toBe(true);
  });

  it("reports no membership when items were not requested", () => {
    // The library shelf asks without item ids; nothing should claim to be
    // removable on the strength of titleIds alone.
    const withoutItems = [{ id: 1, name: "Comfort rereads", titleIds: [10] }];

    expect(collectionMembership(withoutItems, 10)).toEqual([
      { id: 1, name: "Comfort rereads", itemId: null },
    ]);
  });

  it("returns nothing when the viewer has no collections", () => {
    expect(collectionMembership([], 10)).toEqual([]);
  });
});
