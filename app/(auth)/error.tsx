"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AuthError({
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
    <div className="grid gap-4 text-center">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t complete that. Please try again.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={reset}
          className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
        >
          Try again
        </Button>
        <Button asChild variant="outline" className="rounded-pill">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    </div>
  );
}
