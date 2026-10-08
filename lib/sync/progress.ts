/**
 * How far a long-running sync has got, for a progress bar.
 *
 * `value` is 0–1 across the whole run and `step` names what is happening now,
 * in words a reader would use ("Reading your MyAnimeList list"). The account
 * sync on /settings and Refresh library on /library both report in this
 * shape, so both can draw the same bar.
 */
export type SyncProgress = { step: string; value: number };

export type ProgressReporter = (step: string, value: number) => void;

/**
 * A reporter for one part of a larger run.
 *
 * The part reports its own 0–1, and this places it between `from` and `to`
 * of the whole — so the MyAnimeList pull can say "half done" without knowing
 * that it is only the first 60% of a refresh. Values are clamped, so a part
 * that overshoots its estimate never moves the bar backwards into the next.
 */
export function progressSlice(
  report: ProgressReporter | undefined,
  from: number,
  to: number,
): ProgressReporter | undefined {
  if (!report) return undefined;
  return (step, value) =>
    report(step, from + (to - from) * Math.max(0, Math.min(1, value)));
}
