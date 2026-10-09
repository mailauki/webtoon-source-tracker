import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/*
 * Pieces shared by the loading.tsx files. Each one mirrors the real
 * component's box — the same grid columns, the same 9/16 card — so the page
 * replaces the skeleton without the layout jumping.
 */

/** The title and its subtitle line, as every page heading draws them. */
export function HeadingSkeleton({ title = "w-40", line = "w-72" }) {
  return (
    <div className="grid gap-1">
      <Skeleton className={`h-8 ${title}`} />
      <Skeleton className={`h-5 max-w-full ${line}`} />
    </div>
  );
}

/** The library / collection / tag grid of EntryCards. */
export function CardGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[9/16] w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * The sticky back link, drawn for real rather than as a block: it needs no
 * data, and being able to tap it while the page loads is the point of it.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button asChild variant="ghost" size="sm" className="rounded-pill text-muted-foreground">
        <Link href={href}>
          <ArrowLeft data-icon="inline-start" />
          {label}
        </Link>
      </Button>
    </div>
  );
}
