"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatusChip = { value: string; label: string; count?: number };

/**
 * MyAnimeList status filters, as the header's secondary row.
 *
 * On wide screens every status fits, so the row just renders. Below `sm` it
 * collapses to the active filter plus a toggle: five statuses and their counts
 * do not fit a phone header, and a horizontally scrolling row hides filters
 * behind a gesture with nothing to indicate they are there.
 *
 * State lives in `?status=`, matching the source chips on the page body.
 */
export function StatusFilter({ statuses }: { statuses: StatusChip[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const active = params.get("status") ?? "";
  const chips: StatusChip[] = [{ value: "", label: "All" }, ...statuses];
  const activeChip = chips.find((c) => c.value === active) ?? chips[0];

  function apply(value: string) {
    const next = new URLSearchParams(params.toString());
    // Clicking the active chip clears the filter.
    if (value === "" || next.get("status") === value) next.delete("status");
    else next.set("status", value);

    setExpanded(false);
    startTransition(() => {
      router.replace(next.size ? `/library?${next}` : "/library", {
        scroll: false,
      });
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 transition-opacity",
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

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide status filters" : "Show status filters"}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-background/60 backdrop-blur px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:hidden"
      >
        {expanded ? "Less" : "Filter"}
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
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
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-pill border bg-background/60 backdrop-blur px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? // Tapas uses a cyan->blue gradient for the active chip.
            "border-transparent bg-gradient-to-r from-cyan-400 to-blue-500 text-white"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {chip.label}
      {typeof chip.count === "number" ? (
        <span className="ml-1 opacity-70 tabular-nums">{chip.count}</span>
      ) : null}
    </button>
  );
}
