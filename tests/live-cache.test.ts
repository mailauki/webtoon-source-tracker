import { describe, expect, it, vi } from "vitest";

import { memoizeLive } from "@/lib/live-cache";

/**
 * The entry page's live catalog reads are reused for a few minutes, so the
 * re-render after each save renders from the database without waiting on
 * MyAnimeList or AniList again. See lib/live-cache.ts.
 */
describe("memoizeLive", () => {
  function setup(answer: () => Promise<string | null>) {
    let clock = 0;
    const fn = vi.fn((id: number) => (void id, answer()));
    const cached = memoizeLive(fn, {
      key: (id) => String(id),
      ttlMs: 1000,
      max: 2,
      now: () => clock,
    });
    return { fn, cached, tick: (ms: number) => (clock += ms) };
  }

  it("answers a repeat from the cache inside the TTL", async () => {
    const { fn, cached } = setup(async () => "live");
    expect(await cached(1)).toBe("live");
    expect(await cached(1)).toBe("live");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shares one request between concurrent callers", async () => {
    const { fn, cached } = setup(async () => "live");
    await Promise.all([cached(1), cached(1), cached(1)]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("asks again once the TTL has passed", async () => {
    const { fn, cached, tick } = setup(async () => "live");
    await cached(1);
    tick(1000);
    await cached(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // An outage is a moment, not a five-minute fact: the next render retries.
  it("does not keep a null answer", async () => {
    const { fn, cached } = setup(async () => null);
    await cached(1);
    await Promise.resolve();
    await cached(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not keep a rejection", async () => {
    const { fn, cached } = setup(async () => {
      throw new Error("down");
    });
    await expect(cached(1)).rejects.toThrow("down");
    await expect(cached(1)).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("keys on the arguments and evicts the oldest past the cap", async () => {
    const { fn, cached } = setup(async () => "live");
    await cached(1);
    await cached(2);
    await cached(3); // evicts 1
    await cached(2);
    expect(fn).toHaveBeenCalledTimes(3);
    await cached(1);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
