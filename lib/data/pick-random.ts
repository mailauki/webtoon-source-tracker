import type { LibraryRow } from "@/lib/data/entries";

/**
 * Picking a title at random from the shelf.
 *
 * The two halves are separate because they answer different questions and
 * change for different reasons: `selectCandidates` is what the chips mean,
 * and `pickNext` is what "roll again" means. Both are pure, so the dice can
 * be tested without rendering a grid.
 */

/** The chip selections, as LibraryFilters holds them ("" is the All chip). */
export type CandidateFilters = { status: string; source: string };

/**
 * The rows the active chips leave visible.
 *
 * This is the single definition of what a chip selection means: the grid
 * narrows the shelf with it and the dice draws from it, so the two can never
 * disagree about which titles "Reading + Webtoon" covers.
 *
 * The search term is deliberately not a parameter. A search already bypasses
 * the chips (see components/library-grid.tsx), and rolling a die against a
 * title the user just typed by name is incoherent — so the dice hides during
 * a search rather than trying to intersect with one.
 */
export function selectCandidates(
  entries: LibraryRow[],
  { status, source }: CandidateFilters,
): LibraryRow[] {
  return entries.filter((entry) => {
    if (status && entry.list_status !== status) return false;

    if (source === "none") return entry.entry_sources.length === 0;
    if (source) {
      return entry.entry_sources.some((es) => es.sources?.slug === source);
    }
    return true;
  });
}

/** A draw: the title, and whether the cycle started over to find it. */
export type Pick = {
  /** The drawn title, or null when there was nothing to draw from. */
  entry: LibraryRow | null;
  /**
   * True when every candidate had been seen and the cycle restarted. The
   * caller must clear its `seen` set when this is set — see below.
   */
  reset: boolean;
};

/**
 * Draw a title the user has not been shown yet.
 *
 * Rolling repeatedly walks the whole candidate set before any title can come
 * back: a re-roll that returns the cover already on screen reads as a broken
 * button, which is exactly what a uniform draw does on a shelf of three.
 *
 * Exhausting the set starts the cycle over rather than returning null — "you
 * have seen them all" is not a reason to stop offering titles. That restart is
 * reported as `reset` rather than handled here because `seen` belongs to the
 * caller, and it has to be told: a caller that only ever appends would keep
 * growing a set that is already full, find nothing unseen on every later roll,
 * and quietly decay into a uniform draw after the first cycle.
 *
 * Never mutates the set it is given. Ids absent from `candidates` are ignored,
 * so a `seen` accumulated under a wider filter cannot starve a narrower one.
 */
export function pickNext(candidates: LibraryRow[], seen: Set<number>): Pick {
  if (candidates.length === 0) return { entry: null, reset: false };

  const unseen = candidates.filter((entry) => !seen.has(entry.id));
  const exhausted = unseen.length === 0;
  const pool = exhausted ? candidates : unseen;

  return {
    entry: pool[Math.floor(Math.random() * pool.length)],
    reset: exhausted,
  };
}
