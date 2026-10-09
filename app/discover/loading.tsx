import { ShellSkeleton } from "@/components/app-shell";
import { HeadingSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function DiscoverLoading() {
  return (
    <ShellSkeleton>
      <div className="grid gap-8">
        <HeadingSkeleton title="w-40" line="w-96" />

        {/* The "Browse by category" banner. */}
        <Skeleton className="h-16 w-full rounded-lg" />

        {/* "Your collections" heading and its New collection button. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-5 w-56" />
          </div>
          <Skeleton className="h-9 w-36 rounded-pill" />
        </div>

        {/* Two shelves' worth. The real page renders as many as there are
            collections, but a skeleton that guessed high would jump the layout
            more than one that guesses low. */}
        {Array.from({ length: 2 }).map((_, shelf) => (
          <section key={shelf} className="grid gap-3">
            <div className="flex items-end justify-between gap-4">
              <div className="grid gap-1">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <Skeleton className="size-8 rounded-pill" />
            </div>
            <div className="-mx-4 flex gap-3 overflow-hidden px-4 pb-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="aspect-[9/16] w-[130px] shrink-0 rounded-xl"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </ShellSkeleton>
  );
}
