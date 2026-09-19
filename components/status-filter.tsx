"use client";

import { ListFilter } from "lucide-react";

import { useLibraryFilters } from "@/components/library-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export type StatusChip = { value: string; label: string; count?: number };

/**
 * MyAnimeList status filters, as the header's secondary row.
 *
 * On wide screens every status fits, so the row just renders as chips. Below
 * `sm` it becomes a single menu: five statuses and their counts do not fit a
 * phone header, and a horizontally scrolling row hides filters behind a
 * gesture with nothing to indicate they are there.
 *
 * The menu replaces what used to be two controls — a pill showing the active
 * status and a "Filter" button that expanded the row beside it. Two adjacent
 * controls for one choice read as two separate filters, and expanding in place
 * pushed the shelf down the page. One trigger that both states the current
 * filter and opens the list is the whole interaction.
 *
 * The selection is stored per user rather than in the URL, so it survives
 * leaving the page. State comes from LibraryFilters, which both this row and
 * the grid read — see components/library-grid.tsx.
 */
export function StatusFilter({ statuses }: { statuses: StatusChip[] }) {
  const { status: active, setStatus, pending } = useLibraryFilters();

  const chips: StatusChip[] = [{ value: "", label: "All" }, ...statuses];
  const activeChip = chips.find((c) => c.value === active) ?? chips[0];

  function apply(value: string) {
    // Clicking the active chip clears the filter.
    setStatus(value === active ? "" : value);
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 transition-opacity",
        pending && "opacity-60",
      )}
      role="group"
      aria-label="Filter by status"
    >
      {/* The chip row, from `sm` up. */}
      <div className="flex flex-wrap items-center gap-1.5 max-sm:hidden">
        {chips.map((chip) => (
          <StatusPill
            key={chip.value || "all"}
            chip={chip}
            active={active === chip.value}
            onSelect={() => apply(chip.value)}
          />
        ))}
      </div>

      {/* Mobile: the same choice as one menu. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="sm:hidden">
          <Button
            variant="outline"
            className="rounded-full"
            disabled={pending}
            aria-label={`Filter by status: ${activeChip.label}`}
          >
            <ListFilter data-icon="inline-start" />
            <span>{activeChip.label}</span>
            {typeof activeChip.count === "number" ? (
              <span className="text-muted-foreground tabular-nums">
                {activeChip.count}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {/* A radio group, not checkboxes: status is one choice, and the
              "All" entry is how it is cleared. Unlike the chips, re-selecting
              the active item here is a no-op rather than a toggle — a menu
              item that unset the thing it shows as chosen would be a trap. */}
          <DropdownMenuRadioGroup
            value={active}
            onValueChange={(value) => setStatus(value)}
          >
            {chips.map((chip) => (
              <DropdownMenuRadioItem
                key={chip.value || "all"}
                value={chip.value}
              >
                {chip.label}
                {typeof chip.count === "number" ? (
                  <span className="ml-auto pl-2 text-muted-foreground tabular-nums">
                    {chip.count}
                  </span>
                ) : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StatusPill({
  chip,
  active,
  onSelect,
}: {
  chip: StatusChip;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      onClick={onSelect}
      aria-pressed={active}
      variant={active ? "default" : "outline"}
      className="rounded-full"
    >
      {chip.label}
      {typeof chip.count === "number" ? (
        <span className="ml-1 text-muted-foreground tabular-nums">
          {chip.count}
        </span>
      ) : null}
    </Button>
  );
}
