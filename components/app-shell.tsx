import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth/dal";

/**
 * Chrome for the signed-in pages (library, settings, entry).
 *
 * This was `app/(app)/layout.tsx`. Now that those pages sit directly under
 * `app/`, a layout would also wrap the auth pages at `/auth/*`, so the shell
 * is a component each protected page renders instead.
 *
 * It deliberately does NOT call verifySession(): every page that renders it
 * already does so in its own body, and the DAL caches the call per request, so
 * gating here would be a second redundant check rather than the real one.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
					<div className="flex items-center gap-10">
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
						</nav>
					</div>
					<div className="flex items-center gap-1">
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
					</div>
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
