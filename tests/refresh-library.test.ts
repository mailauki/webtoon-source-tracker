import { describe, expect, it, vi } from "vitest";

// The module under test pulls in the sync engines and the Supabase clients;
// only its pure helpers are exercised here.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { progressSlice } from "@/lib/sync/progress";
import { describeRefresh } from "@/lib/sync/refresh-library";

describe("progressSlice", () => {
  it("places a part's own 0–1 within its share of the whole", () => {
    const report = vi.fn();
    const part = progressSlice(report, 0.6, 0.9)!;

    part("Reading your AniList list", 0);
    part("Saving your progress", 0.5);
    part("Saving your progress", 1);

    expect(report.mock.calls.map(([, value]) => Number(value.toFixed(3)))).toEqual([
      0.6, 0.75, 0.9,
    ]);
    expect(report).toHaveBeenCalledWith("Reading your AniList list", 0.6);
  });

  // An estimate that overshoots — MAL's list turning out longer than the
  // library — must never push the bar into the next part's share.
  it("clamps a part that overshoots or undershoots", () => {
    const report = vi.fn();
    const part = progressSlice(report, 0, 0.5)!;

    part("x", 1.4);
    part("x", -0.2);

    expect(report).toHaveBeenNthCalledWith(1, "x", 0.5);
    expect(report).toHaveBeenNthCalledWith(2, "x", 0);
  });

  it("costs nothing when nobody is listening", () => {
    expect(progressSlice(undefined, 0, 1)).toBeUndefined();
  });
});

describe("describeRefresh", () => {
  const quiet = {
    mal: null,
    anilistAdded: 0,
    rulesRemoved: 0,
    malFailed: false,
    anilistFailed: false,
  };

  it("lists what each part did", () => {
    expect(
      describeRefresh({
        ...quiet,
        mal: { skipped: false, entries: 120, removed: 2 },
        anilistAdded: 3,
        rulesRemoved: 1,
      }),
    ).toBe(
      "120 titles synced, 2 removed, 3 added from AniList, 1 removed by your rules.",
    );
  });

  it("says so when nothing needed doing", () => {
    expect(describeRefresh(quiet)).toBe("Already up to date.");
  });

  // One site down still moved the library forward, so the message says what
  // happened and which site was missing rather than reading as a failure.
  it("names the site that could not be reached", () => {
    expect(
      describeRefresh({
        ...quiet,
        mal: { skipped: false, entries: 40, removed: 0 },
        anilistFailed: true,
      }),
    ).toBe("40 titles synced, AniList could not be reached.");
  });
});
