"use client";

import { Search } from "lucide-react";

import { useSearchFilters } from "@/components/search/search-filters";

/**
 * What the page says before anything has been typed.
 *
 * A client component for one reason: whether it shows depends on the live
 * term, which is client state. Both result sections render nothing until there
 * is a term, so without this the page would open as a heading over blank
 * space.
 *
 * It names the switch's current side, because that side decides what the whole
 * page will answer with and it is the one thing here a user can get wrong
 * before typing — searching for a light novel with Webtoons selected returns
 * nothing, and the switch is easier to notice when the empty page has already
 * mentioned it.
 */
export function SearchPrompt() {
  const { query, mediaKind } = useSearchFilters();

  if (query.trim() !== "") return null;

  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
      <Search aria-hidden className="size-8 text-muted-foreground" />
      <p className="font-display text-lg font-semibold">
        Search for a title
      </p>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">
        {mediaKind === "novels"
          ? "Looking through novels and light novels on MyAnimeList, and the ones already on your shelf."
          : "Looking through webtoons, manga and manhwa on MyAnimeList, and the ones already on your shelf."}
      </p>
    </div>
  );
}
