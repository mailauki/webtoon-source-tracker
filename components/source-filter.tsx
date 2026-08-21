"use client";

import { useLibraryFilters } from "@/components/library-grid";
import { cn } from "@/lib/utils";

type Chip = { value: string; label: string; count?: number };

/**
 * Source filter chips.
 *
 * Status filtering moved to the header's secondary row (see StatusFilter);
 * this covers where a title is read, which is scoped to the grid below it.
 *
 * The selection is stored per user rather than in the URL, so it survives
 * leaving the page. State comes from LibraryFilters, shared with the grid and
 * the status row — see components/library-grid.tsx.
 */
export function SourceFilter({ sources }: { sources: Chip[] }) {
  const { source: active, setSource, pending } = useLibraryFilters();

  function apply(value: string) {
    // Clicking the active chip clears that filter.
    setSource(value === active ? "" : value);
  }

  return (
    <div className={cn("grid gap-2", pending && "opacity-60")}>
      <ChipRow
        label="Source"
        chips={[
          { value: "", label: "All" },
          { value: "none", label: "No source" },
          ...sources,
        ]}
        active={active}
        onSelect={apply}
      />
    </div>
  );
}

function ChipRow({
  label,
  chips,
  active,
  onSelect,
}: {
  label: string;
  chips: Chip[];
  active: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label={`Filter by ${label.toLowerCase()}`}
    >
      {chips.map((chip) => {
        const isActive = active === chip.value;
        return (
          <button
            key={chip.value || "all"}
            type="button"
            onClick={() => onSelect(chip.value)}
            aria-pressed={isActive}
            className={cn(
              "shrink-0 rounded-pill border px-3 py-1 text-xs font-semibold transition-colors",
              isActive
                ? // Tapas uses a cyan->blue gradient for the active chip.
                  "border-transparent bg-gradient-to-r from-cyan-400 to-blue-500 text-white"
                : "border-border text-muted-foreground hover:text-foreground",
              chip.value === "none" && !isActive && "border-alert/40 text-alert",
            )}
          >
            {chip.label}
            {typeof chip.count === "number" ? (
              <span className="ml-1 opacity-70">{chip.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
