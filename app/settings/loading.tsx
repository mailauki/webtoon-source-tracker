import { ShellSkeleton } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <ShellSkeleton>
      <div className="grid gap-8">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <section key={i} className="grid gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </section>
        ))}
      </div>
    </ShellSkeleton>
  );
}
