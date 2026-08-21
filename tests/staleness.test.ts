import { afterEach, describe, expect, it, vi } from "vitest";

import { formatLastSynced, isStale } from "@/lib/sync/staleness";

const minutesAgo = (n: number) =>
  new Date(Date.now() - n * 60_000).toISOString();

afterEach(() => vi.useRealTimers());

describe("isStale", () => {
  it("counts never-synced as stale", () => {
    expect(isStale(null)).toBe(true);
  });

  it("is false inside the threshold and true outside it", () => {
    expect(isStale(minutesAgo(30), 60)).toBe(false);
    expect(isStale(minutesAgo(90), 60)).toBe(true);
  });

  // The comparison is strictly greater-than, so the threshold itself is fresh.
  it("treats the exact threshold as fresh", () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-21T12:00:00Z");
    vi.setSystemTime(now);
    const exactly60 = new Date(now.getTime() - 60 * 60_000).toISOString();
    expect(isStale(exactly60, 60)).toBe(false);
  });
});

describe("formatLastSynced", () => {
  it("names the never-synced case rather than showing a duration", () => {
    expect(formatLastSynced(null)).toBe("Never synced");
  });

  it("scales the unit with the elapsed time", () => {
    expect(formatLastSynced(minutesAgo(0))).toBe("Synced just now");
    expect(formatLastSynced(minutesAgo(5))).toBe("Synced 5m ago");
    expect(formatLastSynced(minutesAgo(3 * 60))).toBe("Synced 3h ago");
    expect(formatLastSynced(minutesAgo(2 * 24 * 60))).toBe("Synced 2d ago");
  });
});
