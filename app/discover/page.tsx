import Link from "next/link";
import { Compass, LayoutGrid } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CollectionShelf } from "@/components/collection-shelf";
import { NewCollection } from "@/components/collections/new-collection";
import { Button } from "@/components/ui/button";
import { verifySession } from "@/lib/auth/dal";
import { getCuratedShelves, getMyShelves } from "@/lib/data/collections";

export const metadata = { title: "Discover" };

/**
 * Collections, as stacked shelves: the viewer's own, then the curated ones.
 *
 * The two used to be separate pages — /collections for yours, /discover for
 * the editorial ones — but they are the same thing to a reader: a named group
 * of titles with a see-all page behind it. They share the `collections` table
 * and differ only by whether owner_id is null, so they share a shelf here too.
 * The only difference that surfaces is who can edit: yours carry a "New
 * collection" button here and edit controls on their own page.
 *
 * Deliberately separate from /library. The library is your own shelf and
 * already carries status chips, source chips, sort, hide-hiatus and search;
 * discovery is a different question ("what should I read next") asked of a
 * different set of rows — titles you may not track at all. Putting these
 * shelves above the grid would have crowded both.
 *
 * Browsing by category is one banner from here, not a panel on the page. The
 * categories briefly sat above the shelves, and even capped to eight pills a
 * kind they ran to four rows before the first collection — which inverted
 * what this page is for. They live at /discover/categories now, and the
 * collections get the page back.
 *
 * Signed-in only, like the rest of the app: every RLS policy here is
 * `to authenticated`, so an anonymous visitor would see neither the
 * collections nor the covers.
 */
export default async function DiscoverPage() {
  await verifySession();

  const [mine, shelves] = await Promise.all([
    getMyShelves(),
    getCuratedShelves(),
  ]);

  return (
    <AppShell>
      <div className="grid gap-8">
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Discover
          </h1>
          <p className="text-sm text-muted-foreground">
            Your own collections alongside curated picks of titles worth a look
            — add any of them straight to your library.
          </p>
        </div>

        {/* A banner rather than a button, in the same shape as the library's
            RandomPick. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex min-w-50 flex-1 items-center gap-3">
            <LayoutGrid className="size-5 shrink-0 text-brand" aria-hidden />
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold">
                Looking for something specific?
              </p>
              <p className="text-xs text-muted-foreground">
                Browse by genre, trope, theme or type.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              size="sm"
              className="rounded-full bg-brand font-bold text-brand-foreground hover:bg-brand/90"
            >
              <Link href="/discover/categories">Browse by category</Link>
            </Button>
          </div>
        </div>

        {/* Anchored so the entry page's "Make one" and "Manage your
            collections" links land on this section rather than the top. */}
        <section id="your-collections" className="grid scroll-mt-32 gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-1">
              <h2 className="font-display text-xl font-bold tracking-tight">
                Your collections
              </h2>
              <p className="text-sm text-muted-foreground">
                Your own groupings, private to you.
              </p>
            </div>
            <NewCollection />
          </div>

          {mine.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Make one for anything you want to keep together — comfort rereads,
              a shortlist for a friend, everything you started and never
              finished.
            </p>
          ) : (
            mine.map((collection) => (
              <CollectionShelf key={collection.id} collection={collection} />
            ))
          )}
        </section>

        <section className="grid gap-6">
          <div className="grid gap-1">
            <h2 className="font-display text-xl font-bold tracking-tight">
              Curated collections
            </h2>
            <p className="text-sm text-muted-foreground">
              Hand-picked titles worth a look.
            </p>
          </div>

          {shelves.length === 0 ? (
            // Curated collections are written from /admin, so an empty section
            // here means none have been published yet rather than that anything
            // failed. Say so, and send the reader somewhere useful
            // — the category banner above is still a way on from here.
            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
              <Compass className="size-8 text-muted-foreground" />
              <h3 className="font-display text-lg font-bold">
                No curated collections yet
              </h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Curated collections show up here once they have been put
                together. In the meantime, your own shelf is where the reading
                happens.
              </p>
              <Link
                href="/library"
                className="text-sm font-semibold text-brand hover:underline"
              >
                Go to your library
              </Link>
            </div>
          ) : (
            shelves.map((collection) => (
              <CollectionShelf key={collection.id} collection={collection} />
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}
