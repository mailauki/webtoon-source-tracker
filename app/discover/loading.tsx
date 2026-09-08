import { Skeleton } from "@/components/ui/skeleton";

export default function DiscoverLoading() {
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Two shelves' worth. The real page renders as many as there are
          collections, but a skeleton that guessed high would jump the layout
          more than one that guesses low. */}
      {Array.from({ length: 2 }).map((_, shelf) => (
        <div key={shelf} className="grid gap-3">
          <div className="flex items-end justify-between gap-4">
            <div className="grid gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="size-8 rounded-pill" />
          </div>
          <div className="-mx-4 flex gap-3 overflow-hidden px-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[130px] shrink-0 grid gap-1.5">
                <Skeleton className="aspect-[1/2] w-full rounded-md" />
                <Skeleton className="h-7 w-full rounded-pill" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
