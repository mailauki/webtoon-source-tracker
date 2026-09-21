import { Skeleton } from "@/components/ui/skeleton";

export default function CategoriesLoading() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-3 w-24" />
      </div>

      {/* Pills at plausible widths rather than a uniform run: the real set
          depends on what has been tagged, and a ragged row is closer to what
          arrives than a grid of identical blocks would be. */}
      {[
        [96, 128, 104, 88, 140, 112, 96, 120],
        [120, 96, 152, 108, 88],
        [104, 136, 92, 116, 128, 100],
      ].map((row, group) => (
        <div key={group} className="grid gap-3">
          <Skeleton className="h-3 w-20" />
          <div className="flex flex-wrap gap-2">
            {row.map((width, i) => (
              <Skeleton key={i} className="h-10 rounded-pill" style={{ width }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
