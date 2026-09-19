import { describe, expect, it } from "vitest";

import { canonicalUrl } from "@/lib/data/canonical-url";

describe("canonicalUrl", () => {
  it("leaves a canonical link alone", () => {
    expect(canonicalUrl("https://www.webtoons.com/en/romance/x/list?title_no=1")).toBe(
      "https://www.webtoons.com/en/romance/x/list?title_no=1",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(canonicalUrl("  https://tapas.io/series/x  ")).toBe(
      "https://tapas.io/series/x",
    );
  });

  it("reads blank input as no link", () => {
    expect(canonicalUrl("")).toBe("");
    expect(canonicalUrl("   ")).toBe("");
  });

  describe("hosts", () => {
    it("rewrites the mobile host to the canonical one", () => {
      expect(canonicalUrl("https://m.webtoons.com/en/x/list?title_no=1")).toBe(
        "https://www.webtoons.com/en/x/list?title_no=1",
      );
    });

    it("adds the www a bare host would redirect to", () => {
      expect(canonicalUrl("https://webtoons.com/en/x/list")).toBe(
        "https://www.webtoons.com/en/x/list",
      );
    });

    it("drops the www a canonically-bare host would redirect away", () => {
      expect(canonicalUrl("https://www.tapas.io/series/x")).toBe(
        "https://tapas.io/series/x",
      );
    });

    it("ignores the trailing dot of a fully-qualified name", () => {
      expect(canonicalUrl("https://www.webtoons.com./en/x")).toBe(
        "https://www.webtoons.com/en/x",
      );
    });

    it("leaves an unknown host exactly as it is", () => {
      expect(canonicalUrl("https://m.example-scans.org/read/1")).toBe(
        "https://m.example-scans.org/read/1",
      );
    });
  });

  describe("scheme", () => {
    it("upgrades a known host to https", () => {
      expect(canonicalUrl("http://webtoons.com/en/x")).toBe(
        "https://www.webtoons.com/en/x",
      );
    });

    // :80 is not an explicit port by the time `URL` is done with it, so this
    // is still an ordinary http link to a known host.
    it("upgrades a known host written with the default port", () => {
      expect(canonicalUrl("http://webtoons.com:80/en/x")).toBe(
        "https://www.webtoons.com/en/x",
      );
    });

    // Carrying :8080 onto https would invent an endpoint that answers nowhere.
    it("leaves the host and scheme alone when a real port is named", () => {
      expect(canonicalUrl("http://webtoons.com:8080/en/x?utm_source=s")).toBe(
        "http://webtoons.com:8080/en/x",
      );
    });

    // Upgrading an arbitrary host could break a link that worked, to save a
    // hop that no native app is waiting on. See lib/data/canonical-url.ts.
    it("does not upgrade an unknown host", () => {
      expect(canonicalUrl("http://example-scans.org/read/1")).toBe(
        "http://example-scans.org/read/1",
      );
    });

    it("passes a non-http scheme through untouched", () => {
      expect(canonicalUrl("webtoon://titles/1?utm_source=x")).toBe(
        "webtoon://titles/1?utm_source=x",
      );
    });
  });

  describe("tracking parameters", () => {
    it("strips a utm_ tail", () => {
      expect(
        canonicalUrl(
          "https://tapas.io/series/x?utm_source=share&utm_medium=ios",
        ),
      ).toBe("https://tapas.io/series/x");
    });

    it("strips named click ids", () => {
      expect(canonicalUrl("https://manta.net/en/series/x?fbclid=abc")).toBe(
        "https://manta.net/en/series/x",
      );
    });

    it("matches the parameter name case-insensitively", () => {
      expect(canonicalUrl("https://manta.net/en/series/x?FBCLID=abc")).toBe(
        "https://manta.net/en/series/x",
      );
    });

    it("keeps the parameters that identify the title", () => {
      expect(
        canonicalUrl(
          "https://www.webtoons.com/en/x/list?title_no=95&utm_source=share",
        ),
      ).toBe("https://www.webtoons.com/en/x/list?title_no=95");
    });

    it("leaves no bare question mark behind", () => {
      expect(canonicalUrl("https://tapas.io/series/x?utm_source=share")).toBe(
        "https://tapas.io/series/x",
      );
    });

    // Tracking lives in the query; a fragment is how several of these sites
    // address a chapter, so it is not ours to drop.
    it("keeps the fragment", () => {
      expect(canonicalUrl("https://mangadex.org/chapter/abc#page-3")).toBe(
        "https://mangadex.org/chapter/abc#page-3",
      );
    });

    it("strips tracking from an unknown host too", () => {
      expect(canonicalUrl("http://example-scans.org/read/1?utm_source=x")).toBe(
        "http://example-scans.org/read/1",
      );
    });
  });

  describe("input it cannot improve", () => {
    // The server actions validate with zod first, and the backfill script runs
    // over rows written before that validation existed. Neither wants this to
    // be the thing that rejects a value.
    it("returns unparseable input unchanged", () => {
      expect(canonicalUrl("not a url")).toBe("not a url");
      expect(canonicalUrl("  webtoons.com/en/x  ")).toBe("webtoons.com/en/x");
    });
  });

  it("is idempotent", () => {
    const messy = "http://m.webtoons.com:80/en/x/list?title_no=1&utm_source=share";
    const once = canonicalUrl(messy);
    expect(canonicalUrl(once)).toBe(once);
  });
});
