import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-5xl font-bold text-brand">404</p>
      <h1 className="font-display text-2xl font-bold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        That page doesn&apos;t exist.
      </p>
      <Button asChild className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90">
        <Link href="/library">Go to library</Link>
      </Button>
    </div>
  );
}
