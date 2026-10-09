import { ShellSkeleton } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The page opens on an empty field, so there is nothing to stand in for
 * results here — only the field in the sticky row and the switches below it.
 */
export default function SearchLoading() {
  return (
    <ShellSkeleton secondaryRow={<Skeleton className="h-10 w-full rounded-full" />}>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
    </ShellSkeleton>
  );
}
