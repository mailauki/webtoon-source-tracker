import { collectAltTitles } from "@/lib/data/search";

import type { MalMangaNode } from "./types";

/**
 * Every name MAL has for a title beyond the two the app displays: its
 * synonyms and its Japanese title.
 *
 * Shared by the list sync and the add action, the two paths that write a
 * MAL-backed catalog row, so both store the same set.
 */
export function malAltTitles(
  node: Pick<MalMangaNode, "title" | "alternative_titles">,
): string[] {
  const alt = node.alternative_titles;
  return collectAltTitles(
    [node.title, alt?.en],
    [...(alt?.synonyms ?? []), alt?.ja],
  );
}
