import { Skeleton } from "@/components/ui/skeleton";

export default function EntryLoading() {
  return (
    <div className="grid gap-8">
      <Skeleton className="h-4 w-28" />

      <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
        <Skeleton className="aspect-[1/2] w-full max-w-[160px] rounded-md" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-8 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-pill" />
            <Skeleton className="h-5 w-20 rounded-pill" />
          </div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-1 w-full max-w-xs" />
        </div>
      </div>

      <div className="grid gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}
