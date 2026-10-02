import { ExternalLink } from "lucide-react";

import type { UnmatchedTitle } from "@/lib/sync/plan-account-sync";
import { searchOtherSiteUrl, titleUrl } from "@/lib/sync/unmatched-titles";

const GROUPS: {
  onlyOn: UnmatchedTitle["onlyOn"];
  heading: string;
  hint: string;
  searchLabel: string;
}[] = [
  {
    onlyOn: "anilist",
    heading: "On AniList, not matched on MyAnimeList",
    hint: "Either MyAnimeList doesn't have the title, or AniList's entry isn't linked to it.",
    searchLabel: "Search MyAnimeList",
  },
  {
    onlyOn: "mal",
    heading: "On MyAnimeList, not found on AniList",
    hint: "Either AniList doesn't have the title, or its entry isn't linked to this MyAnimeList one.",
    searchLabel: "Search AniList",
  },
];

/**
 * The titles the last account sync skipped because it could not pair them.
 *
 * Grouped by the site each was found on, with a link to it there and a search
 * on the site it is missing from — the two things the user needs to add it,
 * or to fix the link between the two entries, by hand. Collapsed by default:
 * for a webtoon-heavy list this can run long.
 */
export function UnmatchedTitles({ titles }: { titles: UnmatchedTitle[] }) {
  if (titles.length === 0) return null;

  return (
    <details className="group rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {titles.length} {titles.length === 1 ? "title" : "titles"} not matched
        between the two sites
      </summary>

      <div className="grid gap-4 border-t border-border px-3 py-3">
        {GROUPS.map((group) => {
          const items = titles.filter((t) => t.onlyOn === group.onlyOn);
          if (items.length === 0) return null;

          return (
            <section key={group.onlyOn} className="grid gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  {group.heading} ({items.length})
                </h3>
                <p className="text-xs text-muted-foreground">{group.hint}</p>
              </div>
              <ul className="grid gap-1.5">
                {items.map((item) => (
                  <li
                    key={`${item.onlyOn}-${item.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                  >
                    <a
                      href={titleUrl(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 break-words underline-offset-4 hover:underline"
                    >
                      {item.title}
                    </a>
                    <a
                      href={searchOtherSiteUrl(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {group.searchLabel}
                      <ExternalLink aria-hidden className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </details>
  );
}
