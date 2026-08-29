import { LibraryBig, LogOut, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { HeaderSearch } from "@/components/header-search";
import { PullToRefresh } from "@/components/pull-to-refresh";
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
 * `searchable` gates the search control for the same reason: it filters the
 * library shelf, which only /library renders.
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
      <header className="fixed w-full top-0 z-40 border-b border-border bg-background/80 backdrop-blur px-4">
        {/* `relative` anchors the expanded search, which overlays the row. */}
        <div className="relative h-[60px] mx-auto flex max-w-6xl items-center justify-between gap-4 py-3">
					<div className="flex items-center gap-3 sm:gap-6">
						{/* The logo always shows; the wordmark rejoins it once there is
						    room. One icon serves both themes: it is an amber tile with
						    its own rounded corners baked into the artwork, so it needs no
						    per-theme variant and no tinting. `rounded-md` only matches
						    that existing curve — the art already sits on transparency
						    outside it — and keeps the tile from fighting the pill shapes
						    across the rest of the row.

						    The wordmark returns at `sm`, alongside the nav labels. Note
						    that the expanded search overlays from the right at up to
						    max-w-md, so at exactly `sm` it can reach back over the
						    wordmark; from `md` up the field clears it. Below `sm` it
						    covers this icon — see HeaderSearch, which paints an opaque
						    strip there so neither the tile nor the header showing through
						    its transparent corners peeks around the field's pill.

						    The image stays `alt=""` and the text carries the link's
						    accessible name at every width — it only toggles between
						    sr-only and visible, so the name never doubles up. */}
						<Link href="/library" className="flex shrink-0 items-center gap-2">
							<Image
								src="/icon-1024x1024.png"
								alt=""
								width={2048}
								height={2048}
								priority
								className="size-8 rounded-md"
							/>
							<span className="font-display text-lg font-bold tracking-tight max-sm:sr-only">
								Source<span className="text-brand">Tracker</span>
							</span>
						</Link>

						{/* Below `sm` each control collapses to its icon: the label is
						    hidden and the button squares off, so the row still fits a
						    narrow screen without the nav wrapping. The text stays in the
						    DOM as an accessible name at every width. */}
						<nav className="flex items-center gap-1">
							<Button
								asChild
								variant="ghost"
								size="sm"
								className="rounded-pill max-sm:size-9 max-sm:px-0"
							>
								<Link href="/library">
									<LibraryBig className="size-4 sm:size-3.5" />
									<span className="max-sm:sr-only">Library</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								size="sm"
								className="rounded-pill max-sm:size-9 max-sm:px-0"
							>
								<Link href="/settings">
									<Settings className="size-4 sm:size-3.5" />
									<span className="max-sm:sr-only">Settings</span>
								</Link>
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
								className="rounded-pill text-muted-foreground max-sm:size-9 max-sm:px-0"
							>
								<LogOut className="size-4 sm:size-3.5" />
								<span className="max-sm:sr-only">Sign out</span>
							</Button>
						</form>
					</div>
        </div>
      </header>
			<div data-app-chrome className="sticky top-15 z-40">
        {/* Secondary row, only on pages that supply filters. */}
        {filters && (
          <div className="mx-auto max-w-6xl px-4 py-2">{filters}</div>
        )}
			</div>

      {/* The indicator hangs below the chrome. How much chrome there is
          varies — the filter row wraps to two lines on a narrow screen — so
          PullToRefresh measures the sticky row rather than taking an offset. */}
      <PullToRefresh />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 mt-15">
        {children}
      </main>

      <footer className="border-t border-border px-4 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <p>Signed in as {profile?.display_name ?? "your account"}</p>
          <nav className="flex gap-4">
            <Link href="/privacy-policy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms-of-service" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
