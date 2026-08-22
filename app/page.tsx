import { ArrowRight, BookMarked, Layers, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getOptionalSession } from "@/lib/auth/dal";

/**
 * Public landing page.
 *
 * This route reads cookies to decide whether to render or redirect, so it
 * cannot be prerendered at build time — `cookies()` is unavailable then, and
 * the static shell 500s in production even though dev renders it fine.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  // Bare `title` would get the "· Webtoon Source Tracker" template suffix
  // appended to the product's own name. `absolute` opts out of the template.
  title: { absolute: "Webtoon Source Tracker" },
};

const FEATURES = [
  {
    icon: Layers,
    title: "One title, every source",
    body: "Record each platform you read a series on — with its own URL, chapter count, and notes. Started on WEBTOON and moved to Tapas? Both are kept, so you always know where you left off.",
  },
  {
    icon: RefreshCw,
    title: "Synced with MyAnimeList",
    body: "Connect your MAL account and your list comes across: titles, covers, status, and progress. Update progress here and it writes straight back to MAL.",
  },
  {
    icon: BookMarked,
    title: "Yours to keep",
    body: "MyAnimeList is a connection, not a login — unlink and relink whenever you like without losing your account or the source assignments you built up.",
  },
];

export default async function RootPage({ searchParams }: PageProps<"/">) {
  const session = await getOptionalSession();

  // Supabase reports OAuth failures that happen BEFORE the code exchange by
  // appending them to the root of the configured redirect target, not to
  // /auth/callback — so they arrive here rather than at our callback route.
  // Forwarding them keeps the reason visible; dropping them (as this route
  // used to) leaves the user bounced to /login with no explanation.
  const params = await searchParams;
  const reason =
    typeof params.error_description === "string"
      ? params.error_description
      : typeof params.error === "string"
        ? params.error
        : undefined;

  if (reason) {
    // Signed-in users were mid-link; everyone else was mid-sign-in.
    const page = session ? "/settings" : "/auth/login";
    redirect(`${page}?error=${encodeURIComponent(reason)}`);
  }

  // Signed-in visitors have no use for the pitch.
  if (session) redirect("/library");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          {/* Both files bake in their own opaque background, so they are
              swapped by theme rather than tinted — matching AppShell. */}
          <Image
            src="/wst-logo.png"
            alt=""
            width={2048}
            height={2048}
            priority
            className="size-8 rounded-md dark:hidden"
          />
          <Image
            src="/wst-logo-dark.png"
            alt=""
            width={2048}
            height={2048}
            priority
            className="hidden size-8 rounded-md dark:block"
          />
          <span className="font-display text-lg font-bold tracking-tight">
            Source<span className="text-brand">Tracker</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="rounded-pill">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 pt-16 pb-20 text-center sm:pt-24">
          <h1 className="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            MyAnimeList knows <span className="text-muted-foreground">what</span>{" "}
            you read.
            <br />
            This knows <span className="text-brand">where</span>.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            Series move between apps. Licenses lapse, official releases stall,
            and chapter 42 lives somewhere different from chapter 41. Webtoon
            Source Tracker keeps the one thing your reading list leaves out —
            the platform each chapter was actually on.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-pill">
              <Link href="/auth/signup">
                Create a free account
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-pill"
            >
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Free, no ads, no tracking. A MyAnimeList account is optional.
          </p>
        </section>

        <section className="border-t border-border bg-muted/30 px-6 py-16">
          <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-3 sm:gap-8">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col gap-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-brand/15 text-brand">
                  <Icon className="size-4.5" />
                </span>
                <h2 className="font-display font-semibold">{title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold">How it works</h2>
            <ol className="mt-8 grid gap-5 text-left">
              {[
                "Create an account with email, Google, or Discord.",
                "Connect MyAnimeList to pull in your manga list — or skip it and add titles by hand.",
                "Tag each title with where you read it, and keep the URL, progress, and notes that go with it.",
              ].map((step, i) => (
                <li key={step} className="flex gap-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand font-display text-sm font-bold text-brand-foreground">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {step}
                  </span>
                </li>
              ))}
            </ol>

            <Button asChild size="lg" className="mt-10 rounded-pill">
              <Link href="/auth/signup">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <p>
            Not affiliated with MyAnimeList, WEBTOON, or Tapas.
          </p>
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
