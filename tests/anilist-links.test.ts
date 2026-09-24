import { describe, expect, it } from "vitest";

import {
  catalogLinks,
  chapterDifference,
  higherChapterCount,
  suggestSourceLinks,
} from "@/lib/data/anilist-links";

const tapas = { name: "Tapas", base_url: "https://tapas.io" };
const lezhin = { name: "Lezhin Comics", base_url: "https://www.lezhinus.com" };
const kakao = { name: "Kakao Page", base_url: "https://page.kakao.com" };
const physical = { name: "Physical Copy", base_url: null };

const link = (
  url: string,
  site = "x",
  type = "STREAMING",
  language: string | null = "English",
) => ({ url, site, type, language, isDisabled: false });

describe("suggestSourceLinks", () => {
  it("matches on host, not on AniList's site label", () => {
    const out = suggestSourceLinks(
      [
        link("https://www.delitoon.de/detail/1", "Lezhin"),
        link("https://www.tapas.io/series/x/info?utm_source=a", "Tapas"),
      ],
      [
        { id: 1, url: null, sources: lezhin },
        { id: 2, url: null, sources: tapas },
      ],
    );
    expect(out).toEqual([
      { attachedId: 2, sourceName: "Tapas", url: "https://tapas.io/series/x/info" },
    ]);
  });

  it("never suggests a source the entry does not have", () => {
    const out = suggestSourceLinks(
      [link("https://tapas.io/a"), link("https://page.kakao.com/c/1")],
      [{ id: 1, url: null, sources: kakao }],
    );
    expect(out.map((s) => s.attachedId)).toEqual([1]);
  });

  it("skips non-reading and disabled links, and one per source", () => {
    const out = suggestSourceLinks(
      [
        link("https://page.kakao.com/a", "x", "INFO"),
        { ...link("https://page.kakao.com/b"), isDisabled: true },
        link("https://page.kakao.com/content/1"),
        link("https://page.kakao.com/content/2"),
      ],
      [{ id: 1, url: null, sources: kakao }],
    );
    expect(out.map((s) => s.url)).toEqual(["https://page.kakao.com/content/1"]);
  });

  it("offers only links in the reader's language", () => {
    const webtoon = { name: "WEBTOON", base_url: "https://www.webtoons.com" };
    const attached = [{ id: 1, url: null, sources: webtoon }];
    const links = [
      link("https://www.webtoons.com/fr/x/list?title_no=1", "x", "STREAMING", "French"),
      link("https://www.webtoons.com/x/list?title_no=2", "x", "STREAMING", null),
      link("https://www.webtoons.com/en/x/list?title_no=3"),
      link("https://www.webtoons.com/es/x/list?title_no=4", "x", "STREAMING", "Spanish"),
    ];

    expect(suggestSourceLinks(links, attached).map((s) => s.url)).toEqual([
      "https://www.webtoons.com/en/x/list?title_no=3",
    ]);
    expect(suggestSourceLinks(links, attached, "es").map((s) => s.url)).toEqual([
      "https://www.webtoons.com/es/x/list?title_no=4",
    ]);
  });

  it("leaves a source that has a URL, and one with no base URL, alone", () => {
    const out = suggestSourceLinks(
      [link("https://tapas.io/a")],
      [
        { id: 1, url: "https://tapas.io/mine", sources: tapas },
        { id: 2, url: null, sources: physical },
      ],
    );
    expect(out).toEqual([]);
  });
});

describe("chapterDifference", () => {
  it("says nothing when the sites agree or neither counts", () => {
    expect(chapterDifference(201, 201)).toBeNull();
    expect(chapterDifference(0, null)).toBeNull();
  });

  it("reports a disagreement, and a count only one site has", () => {
    expect(chapterDifference(179, 182)).toBe(
      "MyAnimeList lists 179 chapters; AniList lists 182.",
    );
    expect(chapterDifference(0, 201)).toBe(
      "MyAnimeList has no chapter count; AniList lists 201.",
    );
    expect(chapterDifference(120, null)).toBe(
      "AniList has no chapter count; MyAnimeList lists 120.",
    );
  });
});

describe("higherChapterCount", () => {
  it("takes the higher real count and ignores uncounted ones", () => {
    expect(higherChapterCount(179, 182, 175)).toBe(182);
    expect(higherChapterCount(0, null, 120)).toBe(120);
    expect(higherChapterCount(0, null, undefined)).toBeNull();
  });
});

describe("catalogLinks", () => {
  it("keys each matching source's link by its id", () => {
    const catalog = [
      { id: 1, ...tapas },
      { id: 2, ...kakao },
      { id: 3, ...physical },
    ];
    expect(
      catalogLinks(
        [
          link("https://tapas.io/series/x/info"),
          link("https://page.kakao.com/content/1", "x", "STREAMING", "Korean"),
        ],
        catalog,
      ),
    ).toEqual({ 1: "https://tapas.io/series/x/info" });
  });
});
