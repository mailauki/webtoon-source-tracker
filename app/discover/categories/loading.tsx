import { ShellSkeleton } from "@/components/app-shell";
import { BackLink, HeadingSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function CategoriesLoading() {
  return (
    <ShellSkeleton secondaryRow={<BackLink href="/discover" label="Discover" />}>
      <div className="grid gap-6">
        <HeadingSkeleton title="w-44" line="w-80" />

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
    </ShellSkeleton>
  );
}
