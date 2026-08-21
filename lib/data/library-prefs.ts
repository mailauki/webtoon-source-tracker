/**
 * How a stored filter preference becomes a chip selection.
 *
 * Two stored values mean "show everything" and must not be confused with each
 * other anywhere else in the code:
 *
 *   - null     — the user has never chosen; no row, or no value for this chip
 *   - `all`    — the user explicitly asked to see everything
 *
 * Both render as the All chip, so this function flattens them to the same
 * empty string. They stay distinct in the database because only the second
 * survives a future change to what the default should be.
 */

/** The value stored when the user explicitly asks to see everything. */
export const ALL = "all";

/**
 * The chip value to render as active: a status/source slug, or "" for All.
 */
export function resolveActiveChip(saved: string | null | undefined): string {
  return !saved || saved === ALL ? "" : saved;
}
