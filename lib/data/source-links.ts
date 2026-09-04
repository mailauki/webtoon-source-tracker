/**
 * Which attached source a "go and read it" control should open.
 *
 * Kept in `lib/data` rather than beside the card menu for the same reason as
 * `rank-sources.ts`: the menu module imports the server actions it submits, so
 * anything importing it inherits that graph. The library card, the dice
 * dialog, and the tests all need this logic and none of them need the actions.
 */

/**
 * The fields a link decision reads, structurally.
 *
 * Declared here rather than imported from `entries.ts` so client components can
 * name it without reaching into a `server-only` module. The helpers are generic
 * over it, so a caller passing full library rows gets full rows back.
 */
export type SourceAttachment = {
  url: string | null;
  is_primary: boolean;
  sources: { name: string } | null;
};

/**
 * The attached sources that can actually be opened.
 *
 * Quick-add attaches a source with no URL, so an attachment is not a link.
 * Those are dropped rather than shown inert — the entry page is where a
 * missing URL gets filled in.
 */
export function linkableSources<T extends SourceAttachment>(
  attached: T[],
): T[] {
  return attached.filter((es) => Boolean(es.url?.trim()) && es.sources);
}

/**
 * The one source a read button should open.
 *
 * Primary first — that is what the crown on the pill means, and picking
 * anything else would make the badge and the button disagree about where this
 * title is read. Falling back to the first linkable attachment keeps the
 * button useful for the entries that never had a primary marked.
 *
 * Returns null when nothing is linkable, which is the same bar the menu's
 * "Go to …" items clear: a quick-added source carries no URL, and a button
 * that goes nowhere is worse than no button.
 */
export function readingLink<T extends SourceAttachment>(
  attached: T[],
): T | null {
  const linkable = linkableSources(attached);
  return linkable.find((es) => es.is_primary) ?? linkable[0] ?? null;
}
