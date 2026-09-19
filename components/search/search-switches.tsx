"use client";

import { BookText, Eye, EyeOff, Images } from "lucide-react";

import { useSearchFilters } from "@/components/search/search-filters";
import { Button } from "@/components/ui/button";
import { MEDIA_KINDS, type MediaKind } from "@/lib/data/search";
import { cn } from "@/lib/utils";

/**
 * The two switches under the search field.
 *
 * They are deliberately unlike each other, because they are not the same kind
 * of control. The novels/webtoons switch decides which half of the catalog the
 * page is about — the primary "what am I looking at" question, the same one
 * the library's status chips answer, so it gets the same loud cyan→blue
 * treatment. The NSFW toggle only widens what the first one returns, so it
 * stays quiet, like the library's hiatus and owned toggles. Giving both the
 * primary treatment would leave nothing for the eye to land on first.
 */
export function SearchSwitches() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <MediaKindSwitch />
      <NsfwToggle />
    </div>
  );
}

const KIND_OPTIONS: Record<
  MediaKind,
  { label: string; Icon: typeof Images }
> = {
  webtoons: { label: "Webtoons", Icon: Images },
  novels: { label: "Novels", Icon: BookText },
};

/**
 * Novels, or everything else.
 *
 * Two chips rather than one toggle button, because neither side is the absence
 * of the other: "Novels" is a place you go, not a filter you switch off, and a
 * single pressed/unpressed button would leave the unpressed state naming the
 * thing you are NOT looking at. Both sides are always visible and exactly one
 * is always selected — there is no "all", by design; see lib/data/search.ts.
 *
 * Clicking the selected chip does nothing, unlike the library's chips where a
 * second click clears the filter. There is nothing to clear to.
 */
function MediaKindSwitch() {
  const { mediaKind, setMediaKind, pending } = useSearchFilters();

  return (
    <div
      role="group"
      aria-label="Search for"
      className={cn("flex gap-2", pending && "opacity-60")}
    >
      {MEDIA_KINDS.map((kind) => {
        const active = kind === mediaKind;
        const { label, Icon } = KIND_OPTIONS[kind];
        return (
          <Button
            key={kind}
            onClick={() => setMediaKind(kind)}
            aria-pressed={active}
            variant={active ? "default" : "outline"}
            className={cn(
              "rounded-full",
              active &&
                "bg-gradient-to-r from-cyan-400 to-blue-500 hover:opacity-90",
            )}
          >
            <Icon aria-hidden data-icon="inline-start" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Whether the catalog search may return adult titles.
 *
 * Off by default, and it only reaches MyAnimeList — the library half of this
 * page shows everything the user already tracks either way. That is the same
 * split getMangaList and searchManga already take: hiding a title someone put
 * on their own list would look like the app lost their data, while a discovery
 * search should start from the safe side.
 *
 * The icon swaps with the state instead of staying fixed the way HiatusFilter's
 * does, because the label cannot carry it: "Include NSFW" describes the switch
 * in both positions, and on a phone the label is the first thing dropped — so
 * without the swap the only signal left would be the border.
 */
function NsfwToggle() {
  const { includeNsfw, setIncludeNsfw, pending } = useSearchFilters();

  return (
    <Button
      onClick={() => setIncludeNsfw(!includeNsfw)}
      aria-pressed={includeNsfw}
      variant={includeNsfw ? "secondary" : "outline"}
      className="rounded-full"
      disabled={pending}
    >
      {includeNsfw ? (
        <Eye aria-hidden data-icon="inline-start" />
      ) : (
        <EyeOff aria-hidden data-icon="inline-start" />
      )}
      <span className="max-sm:sr-only">Include NSFW</span>
    </Button>
  );
}
