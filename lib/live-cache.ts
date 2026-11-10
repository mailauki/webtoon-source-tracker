/**
 * A small in-memory cache for the live catalog reads an entry page makes.
 *
 * The entry page renders from the database first; MyAnimeList's and
 * AniList's live answers only add to it. But every save on that page
 * revalidates it, and the re-render asked both sites again — so a progress
 * save waited on two third-party round trips that return the same public
 * catalog data they returned a second ago. The iOS app avoids the same cost
 * by asking for an entry's extras once, separately from the entry itself.
 *
 * Not Next's Data Cache: `revalidatePath` on the entry page invalidates the
 * fetches made while rendering it, which is exactly the re-render this is
 * for. A per-instance Map survives that, and what it holds is public catalog
 * data (no token is ever sent on these reads), so sharing it across users on
 * one instance is safe.
 *
 * The in-flight promise is stored, so concurrent renders share one request.
 * A null or rejected result is dropped rather than kept: a site that was
 * briefly unreachable should be asked again on the next render, not held
 * "down" for the whole TTL.
 */
export function memoizeLive<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result | null>,
  {
    key,
    ttlMs,
    max = 500,
    now = Date.now,
  }: {
    key: (...args: Args) => string;
    ttlMs: number;
    /** Oldest entries are evicted past this many. */
    max?: number;
    /** For tests. */
    now?: () => number;
  },
): ((...args: Args) => Promise<Result | null>) & { clear: () => void } {
  const entries = new Map<string, { at: number; value: Promise<Result | null> }>();

  const cached = (...args: Args) => {
    const k = key(...args);
    const hit = entries.get(k);
    if (hit && now() - hit.at < ttlMs) return hit.value;

    const value = fn(...args);
    entries.delete(k);
    entries.set(k, { at: now(), value });
    while (entries.size > max) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }

    value.then(
      (result) => {
        if (result === null && entries.get(k)?.value === value) entries.delete(k);
      },
      () => {
        if (entries.get(k)?.value === value) entries.delete(k);
      },
    );
    return value;
  };

  return Object.assign(cached, { clear: () => entries.clear() });
}

/** How long a title's live catalog details are reused: five minutes. */
export const LIVE_TTL_MS = 5 * 60 * 1000;
