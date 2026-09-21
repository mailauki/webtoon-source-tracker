/**
 * Age brackets, and what they entitle somebody to see.
 *
 * Kept client-safe, unlike the modules that read the catalog: the settings
 * form is client-side and the tests need this directly, the same reason
 * `tag-items.ts` sits beside `tags.ts`.
 *
 * The bracket is stored on `profiles`; see that migration for why a range
 * rather than a date of birth.
 */

export type AgeRange = "under_13" | "13_to_15" | "16_to_17" | "18_or_over";

/**
 * The brackets, youngest first, with the label the form shows.
 *
 * The boundaries are 13, 16 and 18, which is not an arbitrary spread: they are
 * the thresholds Apple's Declared Age Range API lets an app ask about, so a
 * platform signal maps onto these brackets without having to invent a
 * boundary that the signal cannot actually answer.
 */
export const AGE_RANGES: { value: AgeRange; label: string }[] = [
  { value: "under_13", label: "Under 13" },
  { value: "13_to_15", label: "13 to 15" },
  { value: "16_to_17", label: "16 to 17" },
  { value: "18_or_over", label: "18 or over" },
];

const RANGE_VALUES = new Set<string>(AGE_RANGES.map((range) => range.value));

/** How the bracket was established. See the migration for the write rules. */
export type AgeAssuranceMethod =
  | "self_declared"
  | "apple_declared_age_range"
  | "google_play_age_signals";

/** Has this account confirmed an age bracket at all? */
export function hasDeclaredAge(range: string | null | undefined): boolean {
  return Boolean(range && RANGE_VALUES.has(range));
}

/**
 * May this account see adult titles?
 *
 * Only the top bracket qualifies, and an account that has never confirmed does
 * not — the unanswered case has to fall on the same side as "no", or the
 * confirmation would be advisory and the whole thing decorative. A bracket
 * string this version does not recognise is treated as unconfirmed for the
 * same reason, which is the opposite direction `isMature` takes and
 * deliberately so: there, guessing wrong hides somebody's own library; here,
 * guessing wrong shows adult titles to an account that never said it could.
 */
export function isAdult(range: string | null | undefined): boolean {
  return range === "18_or_over";
}

/** A stored value narrowed back to the union, or null if it is not one. */
export function parseAgeRange(
  range: string | null | undefined,
): AgeRange | null {
  return hasDeclaredAge(range) ? (range as AgeRange) : null;
}

/** The label for a stored bracket, for a surface that reports it back. */
export function ageRangeLabel(range: string | null | undefined): string | null {
  return AGE_RANGES.find((option) => option.value === range)?.label ?? null;
}

/**
 * The bracket a platform age signal describes.
 *
 * This is the seam the native APIs would land on, and the reason
 * `age_assurance_method` has values this codebase cannot yet write. Apple's
 * Declared Age Range API and Google Play's age signals both answer with a
 * numeric range around the thresholds an app asked about rather than with an
 * age, so this maps those bounds onto the brackets above. Neither API is
 * reachable from a browser — both read the signed-in store account through a
 * native SDK — so nothing calls this today; it exists so that adding a native
 * target is a call site, not a redesign.
 *
 * Reads the LOWER bound, because that is the only end that can entitle
 * anybody to anything: a signal of "18 and up, no upper bound" and one of
 * "18 to 24" both mean an adult, while an upper bound of 17 only ever repeats
 * what its lower bound already settled. An absent lower bound is treated as
 * unknown rather than as zero — "we could not tell you" is not "they are a
 * child", and returning null lets the caller fall back to asking.
 */
export function rangeFromBounds(
  lowerBound: number | null | undefined,
): AgeRange | null {
  if (lowerBound === null || lowerBound === undefined) return null;
  if (!Number.isFinite(lowerBound) || lowerBound < 0) return null;

  if (lowerBound >= 18) return "18_or_over";
  if (lowerBound >= 16) return "16_to_17";
  if (lowerBound >= 13) return "13_to_15";
  return "under_13";
}
