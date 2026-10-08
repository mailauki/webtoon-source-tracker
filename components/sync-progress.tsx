import type { SyncProgress } from "@/lib/sync/progress";
import { cn } from "@/lib/utils";

/**
 * The bar both streaming syncs draw: Copy between sites on /settings and
 * Refresh library on /library. One component so the two read as the same
 * kind of thing, differing only in what they are doing.
 */
export function SyncProgressBar({
  label,
  progress,
  className,
}: {
  /** What the bar measures, for screen readers ("Copy progress"). */
  label: string;
  progress: SyncProgress;
  className?: string;
}) {
  const percent = Math.round(progress.value * 100);

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% — ${progress.step}`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="flex justify-between gap-2 text-sm text-muted-foreground">
        <span>{progress.step}…</span>
        <span className="tabular-nums">{percent}%</span>
      </p>
    </div>
  );
}
