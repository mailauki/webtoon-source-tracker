import { ShellSkeleton } from "@/components/app-shell";
import { CardGridSkeleton, HeadingSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <ShellSkeleton
      // Filter menu, Select, and the dice pushed to the far end.
      secondaryRow={
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-pill" />
          <Skeleton className="h-8 w-20 rounded-pill" />
          <Skeleton className="ml-auto h-8 w-28 rounded-pill" />
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <HeadingSkeleton title="w-32" line="w-56" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
        <CardGridSkeleton />
      </div>
    </ShellSkeleton>
  );
}
