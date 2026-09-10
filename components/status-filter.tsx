"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { useLibraryFilters } from "@/components/library-grid";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export type StatusChip = { value: string; label: string; count?: number };

/**
 * MyAnimeList status filters, as the header's secondary row.
 *
 * On wide screens every status fits, so the row just renders. Below `sm` it
 * collapses to the active filter plus a toggle: five statuses and their counts
 * do not fit a phone header, and a horizontally scrolling row hides filters
 * behind a gesture with nothing to indicate they are there.
 *
 * The selection is stored per user rather than in the URL, so it survives
 * leaving the page. State comes from LibraryFilters, which both this row and
 * the grid read — see components/library-grid.tsx.
 */
export function StatusFilter({ statuses }: { statuses: StatusChip[] }) {
  const { status: active, setStatus, pending } = useLibraryFilters();
  const [expanded, setExpanded] = useState(false);

  const chips: StatusChip[] = [{ value: "", label: "All" }, ...statuses];
  const activeChip = chips.find((c) => c.value === active) ?? chips[0];

  function apply(value: string) {
    // Clicking the active chip clears the filter.
    setStatus(value === active ? "" : value);
    setExpanded(false);
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
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5",
          // Collapsed on mobile: show the active chip alone.
          !expanded && "max-sm:hidden",
        )}
      >
        {chips.map((chip) => (
          <StatusPill
            key={chip.value || "all"}
            chip={chip}
            active={active === chip.value}
            onSelect={() => apply(chip.value)}
          />
        ))}
      </div>

      {/* Mobile-only: the collapsed summary. */}
      {!expanded ? (
        <div className="sm:hidden">
          <StatusPill chip={activeChip} active onSelect={() => {}} />
        </div>
      ) : null}

			<Button
				variant="ghost"
				className="rounded-full sm:hidden"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide status filters" : "Show status filters"}>
				{expanded ? "Less" : "Filter"}
        <ChevronDown
					data-icon="inline-end"
					className={cn(
            "transition-transform",
            expanded && "rotate-180",
          )}
				/>
      </Button>
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
		<Button onClick={onSelect} aria-pressed={active} variant={active ? "default" : "outline"} className="rounded-full">{chip.label}
		{typeof chip.count === "number" ? (
        <span className="ml-1 text-muted-foreground tabular-nums">{chip.count}</span>
      ) : null}
		</Button>
  );
}
