import { Skeleton } from "@/components/ui/skeleton";

export default function CollectionLoading() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-3 w-16" />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="grid gap-1.5">
            <Skeleton className="aspect-[1/2] w-full rounded-md" />
            <Skeleton className="h-7 w-full rounded-pill" />
          </div>
        ))}
      </div>
    </div>
  );
}
