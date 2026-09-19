import { Skeleton } from "@/components/ui/skeleton";

/**
 * The page opens on an empty field, so there is nothing to stand in for
 * results here — only the chrome the shell has not rendered yet.
 */
export default function SearchLoading() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-10 w-full max-w-md rounded-full" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
    </div>
  );
}
