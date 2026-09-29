import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  entryCover,
  isPosterUrl,
  posterOptions,
} from "@/lib/data/entry-cover";
import { entryView } from "@/lib/data/entry-view";
import type { LibraryRow } from "@/lib/data/entries";

const CATALOG = "https://cdn.myanimelist.net/images/manga/3/222295l.jpg";
const CHOSEN = "https://example.test/volume-3.jpg";

describe("entryCover", () => {
  it("shows the reader's poster over the catalog's", () => {
    expect(
      entryCover({ cover_url: CHOSEN, media_titles: { main_picture_url: CATALOG } }),
    ).toBe(CHOSEN);
  });

  it("falls back to the catalog's cover when none is chosen", () => {
    expect(
      entryCover({ cover_url: null, media_titles: { main_picture_url: CATALOG } }),
    ).toBe(CATALOG);
    // A row selected without the column — a collection item — still draws.
    expect(entryCover({ media_titles: { main_picture_url: CATALOG } })).toBe(
      CATALOG,
    );
  });

  it("reaches the library card through entryView", () => {
    const row = {
      id: 7,
      list_status: "reading",
      num_chapters_read: 1,
      cover_url: CHOSEN,
      entry_sources: [],
      media_titles: {
        id: 1,
        title: "Tower of God",
        title_en: null,
        main_picture_url: CATALOG,
        mal_media_id: 1,
        num_chapters: 10,
        nsfw: null,
      },
    } as unknown as LibraryRow;

    expect(entryView(row).coverUrl).toBe(CHOSEN);
  });
});

describe("posterOptions", () => {
  it("lists the catalog first, then each site, without repeats", () => {
    const options = posterOptions({
      catalog: CATALOG,
      current: null,
      // MAL's gallery repeats its main picture, which is the catalog's cover.
      myanimelist: [CATALOG, "https://cdn.myanimelist.net/b.jpg", undefined],
      anilist: ["https://s4.anilist.co/c.jpg", null],
    });

    expect(options).toEqual([
      { url: CATALOG, source: "catalog" },
      { url: "https://cdn.myanimelist.net/b.jpg", source: "myanimelist" },
      { url: "https://s4.anilist.co/c.jpg", source: "anilist" },
    ]);
  });

  it("keeps a saved custom poster on offer", () => {
    expect(posterOptions({ catalog: CATALOG, current: CHOSEN })).toEqual([
      { url: CATALOG, source: "catalog" },
      { url: CHOSEN, source: "custom" },
    ]);
  });

  it("does not relabel a saved choice that one of the sites offers", () => {
    const options = posterOptions({
      catalog: null,
      current: CHOSEN,
      anilist: [CHOSEN],
    });
    expect(options).toEqual([{ url: CHOSEN, source: "anilist" }]);
  });
});

describe("isPosterUrl", () => {
  it("accepts https links", () => {
    expect(isPosterUrl(CHOSEN)).toBe(true);
    expect(isPosterUrl("HTTPS://example.test/a.png")).toBe(true);
  });

  it("rejects anything a browser would block or the column would refuse", () => {
    expect(isPosterUrl("http://example.test/a.png")).toBe(false);
    expect(isPosterUrl("javascript:alert(1)")).toBe(false);
    expect(isPosterUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isPosterUrl("not a url")).toBe(false);
    expect(isPosterUrl(`https://example.test/${"a".repeat(2048)}`)).toBe(false);
  });
});

describe("the chosen poster survives a sync", () => {
  it("is never written by either sync", async () => {
    const [mal, anilist] = await Promise.all([
      readFile("lib/sync/sync-list.ts", "utf8"),
      readFile("lib/sync/sync-anilist.ts", "utf8"),
    ]);

    // The syncs upsert named columns, so leaving this one out is what keeps a
    // re-sync from putting the catalog's cover back.
    expect(mal).not.toContain("cover_url");
    expect(anilist).not.toContain("cover_url");
  });

  it("is read by both queries that draw a tracked title", async () => {
    const entries = await readFile("lib/data/entries.ts", "utf8");
    expect(entries.match(/^\s+cover_url,$/gm) ?? []).toHaveLength(2);
  });
});
