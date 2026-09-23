/**
 * How a shelf entry's status and progress are worded, in one place.
 *
 * These lived on `components/entry-card.tsx`, which is a Client Component —
 * so importing either from a Server Component crashed at render ("attempted
 * to call progressLabel() from the server"). They are pure string formatting
 * with no client dependency, and the entry page's header is server-rendered,
 * so they belong here rather than behind a `"use client"` boundary.
 *
 * Kept in `lib/data` for the reason `display-title.ts` and `source-links.ts`
 * give: the card, the row, the entry page, the dice dialog and the tests all
 * need this, and none of them need the server actions a component module
 * drags in.
 */

/**
 * MyAnimeList's list statuses, as a reader reads them.
 *
 * The keys are MAL's own `list_status` values, stored verbatim. Every caller
 * falls back to the raw value for anything not listed — a status MAL adds
 * should render as itself rather than as a blank.
 */
export const STATUS_LABELS: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
  plan_to_read: "Plan to read",
};

/** A status as worded above, or the raw value when it is not one of MAL's. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** "42 / 179" — an em dash stands in for an unknown total (ongoing series). */
export function progressLabel(read: number, total: number | null): string {
  return `${read} / ${total && total > 0 ? total : "—"}`;
}
