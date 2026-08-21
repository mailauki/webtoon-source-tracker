import Link from "next/link";

import { HeaderSearch } from "@/components/header-search";
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
 *
 * `filters` is a slot for a secondary header row. The status chips need
 * per-status counts, which only the library page queries — so the shell
 * provides the row and the page fills it, rather than the shell fetching data
 * that two of its three pages would throw away.
 *
 * `searchable` gates the search control for the same reason: `?q=` only means
 * something on /library.
 */
export async function AppShell({
  children,
  filters,
  searchable = false,
}: {
  children: React.ReactNode;
  filters?: React.ReactNode;
  searchable?: boolean;
}) {
  const profile = await getProfile();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed w-full top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        {/* `relative` anchors the expanded search, which overlays the row. */}
        <div className="relative h-[60px] mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
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
						{searchable && <HeaderSearch />}
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
			<div className="sticky top-15 z-40">
        {/* Secondary row, only on pages that supply filters. */}
        {filters && (
          <div className="mx-auto max-w-6xl px-4 py-2">{filters}</div>
        )}
			</div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 mt-15">
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
