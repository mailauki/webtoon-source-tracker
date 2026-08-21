"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

type Chip = { value: string; label: string; count?: number };

/**
 * Source filter chips.
 *
 * Status filtering moved to the header's secondary row (see StatusFilter);
 * this covers where a title is read, which is scoped to the grid below it.
 *
 * State lives in the URL rather than component state, so views are linkable
 * and shareable and /library stays a Server Component. This is the only part
 * that needs to be a client component.
 */
export function SourceFilter({ sources }: { sources: Chip[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeSource = params.get("source") ?? "";

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    // Clicking the active chip clears that filter.
    if (value === "" || next.get(key) === value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    startTransition(() => {
      router.replace(next.size ? `/library?${next}` : "/library", {
        scroll: false,
      });
    });
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
        active={activeSource}
        onSelect={(v) => apply("source", v)}
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
