/**
 * The backfill's decision, without a Supabase client.
 *
 * scripts/canonicalize-urls.ts exports planRewrites and keeps every side
 * effect behind its direct-run guard, so importing it here reads env, builds
 * no client and talks to nothing — the same arrangement
 * tests/backfill-genres.test.ts relies on.
 */
import { describe, expect, it } from "vitest";

import { planRewrites } from "@/scripts/canonicalize-urls";

describe("planRewrites", () => {
  it("plans a rewrite for a link that is not canonical", () => {
    expect(
      planRewrites([{ id: 1, url: "http://m.webtoons.com/en/x?utm_source=s" }]),
    ).toEqual([
      { id: 1, from: "http://m.webtoons.com/en/x?utm_source=s", to: "https://www.webtoons.com/en/x" },
    ]);
  });

  it("skips a link that is already canonical", () => {
    expect(planRewrites([{ id: 1, url: "https://tapas.io/series/x" }])).toEqual(
      [],
    );
  });

  it("skips a source with no link", () => {
    expect(planRewrites([{ id: 1, url: null }])).toEqual([]);
  });

  // The column's convention for "no link" is null, so a row whose URL is only
  // whitespace is left for a human rather than rewritten to "".
  it("skips a whitespace-only link rather than blanking it", () => {
    expect(planRewrites([{ id: 1, url: "   " }])).toEqual([]);
  });

  it("leaves a link it cannot parse alone", () => {
    expect(planRewrites([{ id: 1, url: "not a url" }])).toEqual([]);
  });

  it("keeps only the rows that move", () => {
    const planned = planRewrites([
      { id: 1, url: "https://tapas.io/series/a" },
      { id: 2, url: "https://webtoons.com/en/b" },
      { id: 3, url: null },
      { id: 4, url: "https://manta.net/en/c?fbclid=x" },
    ]);

    expect(planned.map((r) => r.id)).toEqual([2, 4]);
  });

  it("has nothing left to do on a second pass", () => {
    const rows = [{ id: 1, url: "http://m.webtoons.com/en/x?utm_source=s" }];
    const [first] = planRewrites(rows);
    expect(planRewrites([{ id: 1, url: first.to }])).toEqual([]);
  });
});
