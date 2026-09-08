import { Skeleton } from "@/components/ui/skeleton";

export default function MyCollectionLoading() {
  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="size-9 rounded-pill" />
      </div>

      <Skeleton className="h-9 w-32 rounded-pill" />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="grid gap-1.5">
            <Skeleton className="aspect-[1/2] w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
