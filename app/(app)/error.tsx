"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the authed app.
 *
 * Deliberately does NOT render `error.message`: these can carry Postgres or
 * MyAnimeList internals, and a user can act on none of it. The digest is shown
 * instead so a report can be correlated with server logs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        That page didn&apos;t load. Your library and sources are safe — nothing
        was changed.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={reset}
          className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
        >
          Try again
        </Button>
        <Button asChild variant="outline" className="rounded-pill">
          <Link href="/library">Back to library</Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
