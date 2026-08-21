"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { useLibraryFilters } from "@/components/library-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SORT_OPTIONS, type SortKey } from "@/lib/data/library-prefs";
import { cn } from "@/lib/utils";

/**
 * Sort control, sharing the header's secondary row with the status chips.
 *
 * A menu rather than a chip row: unlike status and source, sort is not a set
 * of independent toggles but one choice out of many, with a direction hanging
 * off it — eight pills for four keys would swamp a row that already holds five
 * statuses, and would read as filters rather than as an ordering.
 *
 * The trigger states the current order in full ("Newest first") rather than
 * showing only an icon, because a grid gives no other clue as to how it is
 * ordered — a cover shows no date.
 *
 * The selection is stored per user, like the filter chips; state comes from
 * LibraryFilters, which the grid reads too — see components/library-grid.tsx.
 */
export function SortFilter() {
  const { sort, setSort, pending } = useLibraryFilters();

  const option =
    SORT_OPTIONS.find((o) => o.key === sort.key) ?? SORT_OPTIONS[0];
  const directionLabel = sort.direction === "asc" ? option.asc : option.desc;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-pill border border-border bg-background/60 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur transition-colors hover:text-foreground data-[state=open]:text-foreground",
          pending && "opacity-60",
        )}
        aria-label={`Sort by ${option.label}, ${directionLabel} first`}
      >
        <ArrowUpDown className="size-3.5" />
        <span className="max-sm:sr-only">{option.label}</span>
        <span className="text-foreground">{directionLabel}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort.key}
          // Changing the key keeps the current direction: switching from
          // newest-updated to newest-added is one decision, and resetting the
          // direction would silently undo the other half of the choice.
          onValueChange={(key) =>
            setSort({ ...sort, key: key as SortKey })
          }
        >
          {SORT_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.key} value={o.key}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        {/* Direction is worded in the active key's own terms — "Oldest"/
            "Newest" for a date, "A–Z" for a title — since "ascending" leaves
            the user to work out which end of a date that is. */}
        <DropdownMenuLabel>Order</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort.direction}
          onValueChange={(direction) =>
            setSort({ ...sort, direction: direction as "asc" | "desc" })
          }
        >
          <DropdownMenuRadioItem value="desc">
            <ArrowDown className="size-3.5" />
            {option.desc} first
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="asc">
            <ArrowUp className="size-3.5" />
            {option.asc} first
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
