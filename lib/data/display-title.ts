/**
 * Which of a title's two names to show.
 *
 * `media_titles` carries both of MAL's: `title` is whatever MAL calls the
 * canonical one — usually the romanised original ("Na Honjaman Level Up") —
 * and `title_en` is `alternative_titles.en`, the English release name
 * ("Solo Leveling"). The English one is what the reading apps put on the cover
 * and what someone scanning a shelf recognises, so it leads wherever a title
 * is shown.
 *
 * It is not always there. MAL leaves `alternative_titles.en` empty for plenty
 * of manga, and for a title with no English release there is nothing to fall
 * back from — so `title` remains the value every one of these rows is
 * guaranteed to have, and the fallback is not an edge case but the common one.
 *
 * Kept in `lib/data` rather than beside a component for the reason
 * `source-links.ts` gives: the card, the row, the dice dialog, the entry page
 * and the tests all need this, and none of them need the server actions a
 * component module drags in.
 */

/**
 * The two names, structurally.
 *
 * `title_en` is required rather than optional on purpose. A query that forgot
 * to select it would otherwise pass here and quietly render the romanised name
 * — which is precisely the bug this module exists to prevent — so the type
 * makes the omission a compile error instead.
 */
export type TitleNames = { title: string; title_en: string | null };

/** Empty-string `title_en` is as absent as null; older rows hold both. */
function english(names: TitleNames): string | null {
  const en = names.title_en?.trim();
  return en ? en : null;
}

/** The name to show. English where MAL has one, the canonical title otherwise. */
export function displayTitle(names: TitleNames): string {
  return english(names) ?? names.title;
}

/**
 * The other name, where showing both is worth the line.
 *
 * Null when they would read as the same thing — MAL stores `title_en` equal to
 * `title` for anything published in English under its original name, and a
 * subtitle repeating the heading verbatim is noise. Only the entry page has
 * room for this; a card shows `displayTitle` alone.
 */
export function secondaryTitle(names: TitleNames): string | null {
  const en = english(names);
  if (!en || en === names.title) return null;
  return names.title;
}
