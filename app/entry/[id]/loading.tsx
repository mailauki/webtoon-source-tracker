import { ShellSkeleton } from "@/components/app-shell";
import { BackLink } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function EntryLoading() {
  return (
    <ShellSkeleton secondaryRow={<BackLink href="/library" label="Back to library" />}>
      <div className="grid gap-8">
        {/* EntryHeader's card: the 9/16 cover stacked over the text on a
            phone, beside it from `sm`. */}
        <div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card sm:flex-row sm:gap-5">
          <Skeleton className="mx-4 mt-4 aspect-[9/16] w-40 shrink-0 self-center rounded-lg sm:m-0 sm:w-44 sm:self-stretch sm:rounded-none" />
          <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 pb-4 sm:py-4 sm:pl-0 sm:pr-5">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-40" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-20 rounded-pill" />
              ))}
            </div>
            <Skeleton className="mt-auto h-10 w-full max-w-sm rounded-lg" />
          </div>
        </div>

        <section className="grid gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </section>
      </div>
    </ShellSkeleton>
  );
}
