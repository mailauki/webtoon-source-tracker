"use client";

import { useMemo, useState } from "react";
import { ListFilter } from "lucide-react";

import { EntryCard } from "@/components/entry-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  anyCollectionFilter,
  filterCollectionItems,
  NO_COLLECTION_FILTERS,
  type CollectionFilterState,
  type LibraryFilter,
} from "@/lib/data/collection-filters";
import type { CollectionItem } from "@/lib/data/collection-items";
import { collectionView } from "@/lib/data/entry-view";
import { STATUS_LABELS } from "@/lib/data/entry-labels";

/** A source the viewer actually has attached somewhere on this page. */
type SourceChip = { value: string; label: string };

/**
 * A category page's titles, with the chips that narrow them.
 *
 * The filter menu and the grid are one component here, where the library
 * splits them across a context provider. The library has to: its chips render
 * into the app shell's header slot and its grid into the page body, so the
 * state has to live above both. These two sit together in the page body, so a
 * provider would be ceremony around a `useState` — and this page is reached
 * and left in one gesture, where the shelf is somewhere you stay.
 *
 * Session-only for the same reason, and deliberately unlike the library:
 * arriving at a category to find most of it hidden by a filter set on a
 * different category last week reads as an empty page, not as a remembered
 * preference. The library is a place you keep; a category is a place you pass
 * through.
 *
 * The chips are derived from the items on the page rather than from the full
 * status and source lists. A category page holds a few dozen titles, most
 * untracked, so most of those lists would be chips that select nothing — and
 * a filter that can only empty the page is worse than no filter.
 */
export function CollectionFilters({
  items,
  /** Passed through to each card, for a collection the viewer owns. */
  collectionId,
  removable = false,
}: {
  items: CollectionItem[];
  collectionId?: number;
  removable?: boolean;
}) {
  const [filters, setFilters] = useState<CollectionFilterState>(
    NO_COLLECTION_FILTERS,
  );

  const trackedCount = useMemo(
    () => items.filter((i) => i.tracked).length,
    [items],
  );

  // Only the statuses and sources present here. Both are derived from the
  // same pass so the two chip lists can never describe different item sets.
  const { statuses, sources } = useMemo(() => {
    const statusSet = new Set<string>();
    const sourceSet = new Set<string>();
    let anyWithoutSource = false;

    for (const item of items) {
      if (!item.tracked) continue;
      statusSet.add(item.tracked.listStatus);
      if (item.tracked.sourceSlugs.length === 0) anyWithoutSource = true;
      for (const slug of item.tracked.sourceSlugs) sourceSet.add(slug);
    }

    const sourceChips: SourceChip[] = [...sourceSet].sort().map((slug) => ({
      value: slug,
      // The slug is what the filter matches on, and a page has no source
      // catalog to look a display name up in. Title-casing it is close
      // enough for the handful of slugs that reach here ("webtoon",
      // "tapas"), and the chip is checked against the same string it shows.
      label: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
    if (anyWithoutSource) {
      sourceChips.unshift({ value: "none", label: "No source" });
    }

    return { statuses: [...statusSet], sources: sourceChips };
  }, [items]);

  const visible = useMemo(
    () => filterCollectionItems(items, filters),
    [items, filters],
  );

  const narrowed = anyCollectionFilter(filters);

  // Nothing the viewer tracks means every chip here would select nothing or
  // everything. The menu is hidden rather than shown dead — on a curated
  // shelf of titles you have none of, there is nothing to filter by.
  const worthFiltering = trackedCount > 0;

  return (
    <div className="grid gap-4">
      {worthFiltering ? (
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu
            filters={filters}
            setFilters={setFilters}
            statuses={statuses}
            sources={sources}
          />
          {/* The count only says something once the chips have changed it.
              Unfiltered it would restate the page's own heading count. */}
          {narrowed ? (
            <p className="text-xs text-muted-foreground">
              {visible.length} of {items.length}
            </p>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="flex min-h-[20vh] flex-col items-center justify-center gap-3 text-center">
          <p className="font-display text-lg font-semibold">No titles match</p>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            Nothing here fits those filters. Clear them to see the whole
            category again.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-pill"
            onClick={() => setFilters(NO_COLLECTION_FILTERS)}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((item) => (
            <li key={item.id}>
              <EntryCard
                view={collectionView(item)}
                removable={
                  removable && collectionId !== undefined
                    ? { collectionId, itemId: item.id }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The chips themselves.
 *
 * Shaped after LibraryFilterMenu — one trigger, radio groups in submenus —
 * so the two surfaces' filters are the same object in the same place. What it
 * leaves out is that menu's toggles and sort: a category page has no stored
 * order to change, and hiatus/owned are questions about a shelf you keep.
 */
function FilterMenu({
  filters,
  setFilters,
  statuses,
  sources,
}: {
  filters: CollectionFilterState;
  setFilters: (next: CollectionFilterState) => void;
  statuses: string[];
  sources: SourceChip[];
}) {
  const { library, status, source } = filters;

  const libraryChips: { value: LibraryFilter; label: string }[] = [
    { value: "", label: "All titles" },
    { value: "tracked", label: "In my library" },
    { value: "untracked", label: "Not in my library" },
  ];

  const statusChips = [
    { value: "", label: "Any status" },
    ...statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })),
  ];
  const sourceChips = [{ value: "", label: "Any source" }, ...sources];

  const activeLibrary =
    libraryChips.find((c) => c.value === library) ?? libraryChips[0];

  // The library chip is named on the trigger, so it is not counted again —
  // otherwise "In my library" would read as "In my library 1".
  const extras = [status, source].filter(Boolean).length;
  const anyActive = anyCollectionFilter(filters);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={anyActive ? "secondary" : "outline"}
          className="rounded-full"
          aria-label={`Filters: ${activeLibrary.label}${
            extras ? `, ${extras} more active` : ""
          }`}
        >
          <ListFilter data-icon="inline-start" />
          <span>{activeLibrary.label}</span>
          {extras ? (
            <span className="rounded-full bg-brand px-1.5 text-xs font-bold text-brand-foreground tabular-nums">
              {extras}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-52">
        {/* First, because on a discovery page it is the question being asked.
            The other two are about the library half it selects. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Library
            <span className="ml-auto pl-4 text-muted-foreground">
              {activeLibrary.label}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            {/* Guarded like the library's, because Radix fires this even when
                the chosen value is the one already active. */}
            <DropdownMenuRadioGroup
              value={library}
              onValueChange={(value) =>
                value !== library &&
                setFilters({ ...filters, library: value as LibraryFilter })
              }
            >
              {libraryChips.map((chip) => (
                <DropdownMenuRadioItem
                  key={chip.value || "all"}
                  value={chip.value}
                >
                  {chip.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Both are facts about a tracked entry, so neither appears unless
            this page has more than one value to choose between. A submenu
            with one real option is a click that decides nothing. */}
        {statuses.length > 1 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Status
              <span className="ml-auto pl-4 text-muted-foreground">
                {statusChips.find((c) => c.value === status)?.label ??
                  statusChips[0].label}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-44">
              <DropdownMenuRadioGroup
                value={status}
                onValueChange={(value) =>
                  value !== status && setFilters({ ...filters, status: value })
                }
              >
                {statusChips.map((chip) => (
                  <DropdownMenuRadioItem
                    key={chip.value || "all"}
                    value={chip.value}
                  >
                    {chip.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {sources.length > 1 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Source
              <span className="ml-auto pl-4 text-muted-foreground">
                {sourceChips.find((c) => c.value === source)?.label ??
                  sourceChips[0].label}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-44">
              <DropdownMenuRadioGroup
                value={source}
                onValueChange={(value) =>
                  value !== source && setFilters({ ...filters, source: value })
                }
              >
                {sourceChips.map((chip) => (
                  <DropdownMenuRadioItem
                    key={chip.value || "all"}
                    value={chip.value}
                  >
                    {chip.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {anyActive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setFilters(NO_COLLECTION_FILTERS)}
            >
              Clear all
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
