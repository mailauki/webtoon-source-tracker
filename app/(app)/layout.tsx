import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getProfile, verifySession } from "@/lib/auth/dal";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Real enforcement. proxy.ts only checked that a cookie existed.
  await verifySession();
  const profile = await getProfile();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/library"
            className="font-display text-lg font-bold tracking-tight"
          >
            Source<span className="text-brand">Tracker</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="rounded-pill">
              <Link href="/library">Library</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-pill">
              <Link href="/settings">Settings</Link>
            </Button>
            <ThemeToggle />
            <form action="/auth/logout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="rounded-pill text-muted-foreground"
              >
                Sign out
              </Button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-border px-4 py-4">
        <p className="mx-auto max-w-6xl text-xs text-muted-foreground">
          Signed in as {profile?.display_name ?? "your account"}
        </p>
      </footer>
    </div>
  );
}
