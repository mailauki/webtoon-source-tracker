import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function EntryNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="font-display text-2xl font-bold">Title not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This entry doesn&apos;t exist, or it isn&apos;t part of your library.
      </p>
      <Button asChild variant="outline" className="rounded-pill">
        <Link href="/library">Back to library</Link>
      </Button>
    </div>
  );
}
