import { Compass, Layers, LibraryBig, LogOut, Search, Settings, ShieldUser } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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
 * `tertiaryRow` is a second tier under it, inside the same sticky container so
 * the two move together rather than stacking two independent sticky offsets.
 * The library uses it for the source chips, under its status row.
 *
 * Neither row paints anything: content scrolls under them, so whatever a page
 * puts here carries its own translucent background (see StatusPill). A ghost
 * button is transparent at rest, so a back link in these rows reads against
 * whatever passes beneath it — give it a ground of its own if that ever needs
 * to stop being true.
 *
 * There is no search control here any more. Search is its own page now, so it
 * is a nav destination like any other — which also means it no longer has to
 * be gated to the one page whose shelf it used to filter.
 */
export async function AppShell({
  children,
  secondaryRow,
  tertiaryRow,
}: {
  children: React.ReactNode;
  secondaryRow?: React.ReactNode;
  tertiaryRow?: React.ReactNode;
}) {
  const profile = await getProfile();
  const admin = await isAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed w-full top-0 z-40 border-b border-border bg-background/80 backdrop-blur px-4">
        <div className="h-[60px] mx-auto flex max-w-6xl items-center justify-between gap-4 py-3 pl-2">
					<div className="flex items-center gap-3 max-sm:gap-6">
						{/* The logo always shows; the wordmark rejoins it once there is
						    room. One icon serves both themes: it is an amber tile with
						    its own rounded corners baked into the artwork, so it needs no
						    per-theme variant and no tinting. `rounded-md` only matches
						    that existing curve — the art already sits on transparency
						    outside it — and keeps the tile from fighting the pill shapes
						    across the rest of the row.

						    The wordmark returns at `sm`, alongside the nav labels.

						    The image stays `alt=""` and the text carries the link's
						    accessible name at every width — it only toggles between
						    sr-only and visible, so the name never doubles up.

						    It points at the 192px asset and skips the image optimizer:
						    at 32px even a 3x screen wants only 96px, and CoverImage
						    explains why nothing here depends on the optimizer. */}
						<Link href="/" className="flex shrink-0 items-center gap-2">
							<Image
								src="/android-chrome-192x192.png"
								alt=""
								width={192}
								height={192}
								preload
								unoptimized
								className="size-8 rounded-md"
							/>
							<span className="font-display text-lg font-bold tracking-tight max-md:sr-only">
								Source<span className="text-brand">Tracker</span>
							</span>
						</Link>

						<nav className="flex items-center gap-1 max-sm:gap-4">
							<NavLink icon={<LibraryBig data-icon="inline-start" />} label="Library" url="/library" />
							{/* Next to the library rather than out in the icon cluster on the
							    right: it is where you go to add a title, which is the same
							    kind of errand as browsing the shelf. */}
							<NavLink icon={<Search data-icon="inline-start" />} label="Search" url="/search" />
							<NavLink icon={<Compass data-icon="inline-start" />} label="Discover" url="/discover" />
							<NavLink icon={<Layers data-icon="inline-start" />} label="Collections" url="/collections" />
							<NavLink icon={<Settings data-icon="inline-start" />} label="Settings" url="/settings" />
							{admin && <NavLink icon={<ShieldUser data-icon="inline-start" />} label="Admin" url="/admin" />}
						</nav>
					</div>
					<div className="flex items-center gap-1">
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
        {/* Tertiary row: a second tier that sticks with the one above it
            rather than under it, so the two move as one block. The library
            puts the source chips here, below its status row. */}
        {tertiaryRow && (
          <div className="mx-auto max-w-6xl px-4 pb-2">{tertiaryRow}</div>
        )}
			</div>

      {/* The indicator hangs below the chrome. How much chrome there is
          varies — the filter row wraps to two lines on a narrow screen — so
          PullToRefresh measures the sticky row rather than taking an offset. */}
      <PullToRefresh />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 mt-15">
        {children}
      </main>

      <footer className="border-t border-border px-4 py-6">
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
