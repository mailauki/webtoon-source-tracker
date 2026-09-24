import { SourceBadge } from "@/components/source-badge";

/**
 * The pieces the library row and the entry page's header both draw, so the
 * row opening up into the header reads as one object at two scales.
 *
 * No "use client": EntryHeader is a Server Component and EntryCard a client
 * one, and both import from here.
 */

type AttachedSource = {
  id: number;
  is_primary: boolean;
  is_paid: boolean;
  is_official: boolean;
  is_hiatus: boolean;
  is_owned: boolean;
  sources: { name: string } | null;
};

export function SourceBadges({ sources }: { sources: AttachedSource[] }) {
  return sources.map((es) =>
    es.sources ? (
      <SourceBadge
        key={es.id}
        source={{
          name: es.sources.name,
          isPrimary: es.is_primary,
          isPaid: es.is_paid,
          isOfficial: es.is_official,
          isHiatus: es.is_hiatus,
          isOwned: es.is_owned,
        }}
      />
    ) : null,
  );
}

/**
 * Divided cells, tabular figures. `sm` is the row's scale, `md` the header's.
 */
export function StatStrip({
  cells,
  size = "md",
}: {
  cells: { label: string; value: React.ReactNode }[];
  size?: "sm" | "md";
}) {
  const sm = size === "sm";
  return (
    <div className="flex w-fit items-center justify-between divide-x divide-border rounded-md border border-border bg-muted/50 text-center">
      {cells.map((c) => (
        <div key={c.label} className={sm ? "px-2 py-1 w-16" : "px-3 py-1.5 w-26"}>
          <p
            className={`${sm ? "text-[9px]" : "text-[10px]"} leading-none text-muted-foreground`}
          >
            {c.label}
          </p>
          <p
            className={`${sm ? "mt-0.5 text-[11px]" : "mt-1 text-sm"} font-bold leading-none whitespace-nowrap tabular-nums`}
          >
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Only drawn when there is a total to divide by. */
export function ProgressBar({
  pct,
  className,
}: {
  pct: number | null;
  className: string;
}) {
  if (pct === null) return null;
  return (
    <div
      className={`h-1 w-full overflow-hidden rounded-full bg-muted ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}% read`}
    >
      <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}
