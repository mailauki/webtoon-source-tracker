import { Compass, Library, LibraryBig, LogOut, Settings, ShieldUser } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { HeaderSearch } from "@/components/header-search";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getProfile, isAdmin } from "@/lib/auth/dal";
import NavLink from "./nav-link";

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
 * `secondaryRow` is a slot for a sticky row under the header. The library
 * fills it with the status chips and the controls beside them — those need
 * per-status counts, which only the library page queries, so the shell
 * provides the row and the page fills it rather than fetching data that its
 * other pages would throw away. The entry page fills it with the back link,
 * which stays reachable the same way while the page scrolls.
 *
 * The row itself paints nothing: content scrolls under it, so whatever a page
 * puts here carries its own translucent background (see StatusPill).
 *
 * `searchable` gates the search control for the same reason: it filters the
 * library shelf, which only /library renders.
 */
export async function AppShell({
  children,
  secondaryRow,
  searchable = false,
}: {
  children: React.ReactNode;
  secondaryRow?: React.ReactNode;
  searchable?: boolean;
}) {
  const profile = await getProfile();
  const admin = await isAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed w-full top-0 z-40 border-b border-border bg-background/80 backdrop-blur px-4">
        {/* `relative` anchors the expanded search, which overlays the row. */}
        <div className="relative h-[60px] mx-auto flex max-w-6xl items-center justify-between gap-4 py-3 pl-2">
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
						    wordmark; from `md` up the field clears it. Below `sm` the
						    row's `pl-2` keeps this icon clear of the field, so the
						    search strip needs no background of its own to hide it.

						    The image stays `alt=""` and the text carries the link's
						    accessible name at every width — it only toggles between
						    sr-only and visible, so the name never doubles up. */}
						<Link href="/" className="flex shrink-0 items-center gap-2">
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

						<nav className="flex items-center gap-1">
							<NavLink icon={<LibraryBig data-icon="inline-start" />} label="Library" url="/library" />
							<NavLink icon={<Compass data-icon="inline-start" />} label="Discover" url="/discover" />
							<NavLink icon={<Library data-icon="inline-start" />} label="Collections" url="/collections" />
							<NavLink icon={<Settings data-icon="inline-start" />} label="Settings" url="/settings" />
							{admin && <NavLink icon={<ShieldUser data-icon="inline-start" />} label="Admin" url="/admin" />}
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
								className="rounded-full text-muted-foreground max-sm:size-9 max-sm:px-0"
							>
								<LogOut data-icon="inline-start" />
								<span className="max-md:sr-only">Sign out</span>
							</Button>
						</form>
					</div>
        </div>
      </header>
			<div data-app-chrome className="sticky top-15 z-40">
        {/* Secondary row, only on pages that supply one. */}
        {secondaryRow && (
          <div className="mx-auto max-w-6xl px-4 py-2">{secondaryRow}</div>
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
