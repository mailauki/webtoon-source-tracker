import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Chrome for the public legal pages.
 *
 * A route group, so the URLs stay at `/privacy-policy` and
 * `/terms-of-service` — the paths MAL's API registration and any app store
 * listing point at — while still sharing one layout.
 *
 * These are deliberately outside AppShell: they must render for signed-out
 * visitors (OAuth consent screens and store reviewers fetch them
 * unauthenticated), and AppShell calls getProfile(), which redirects when
 * there is no session.
 *
 * The header mirrors app/auth/layout.tsx rather than the signed-in header —
 * same wordmark, no nav — since a visitor reading the privacy policy may have
 * no account to navigate to.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          Source<span className="text-brand">Tracker</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {children}
      </main>

      <footer className="border-t border-border px-6 py-4">
        <nav className="mx-auto flex max-w-2xl gap-4 text-xs text-muted-foreground">
          <Link href="/privacy-policy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms-of-service" className="hover:text-foreground">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}
