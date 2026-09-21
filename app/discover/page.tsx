import Link from "next/link";
import { Compass, LayoutGrid } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CollectionShelf } from "@/components/collection-shelf";
import { Button } from "@/components/ui/button";
import { verifySession } from "@/lib/auth/dal";
import { getCuratedShelves } from "@/lib/data/collections";

export const metadata = { title: "Discover" };

/**
 * Curated collections, as stacked shelves.
 *
 * Deliberately separate from /library. The library is your own shelf and
 * already carries status chips, source chips, sort, hide-hiatus and search;
 * discovery is a different question ("what should I read next") asked of a
 * different set of rows — titles you may not track at all. Putting these
 * shelves above the grid would have crowded both.
 *
 * Browsing by category is one link from here, not a panel on the page. The
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

  const shelves = await getCuratedShelves();

  return (
    <AppShell>
      <div className="grid gap-8">
        {/* Stacks under the heading on a phone and sits beside it once there
            is room, the same shape CollectionShelf's own heading row takes. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Discover
            </h1>
            <p className="text-sm text-muted-foreground">
              Collections of titles worth a look — add any of them straight to
              your library.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-pill self-start sm:self-auto"
          >
            <Link href="/discover/categories">
              <LayoutGrid data-icon="inline-start" />
              Browse by category
            </Link>
          </Button>
        </div>

        {shelves.length === 0 ? (
          // Curated collections are seeded server-side (there is no admin UI),
          // so an empty page here means none have been written yet rather than
          // that anything failed. Say so, and send the reader somewhere useful
          // — the categories above are still a way on from here.
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <Compass className="size-8 text-muted-foreground" />
            <h2 className="font-display text-lg font-bold">
              No collections yet
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Curated collections show up here once they have been put together.
              In the meantime, your own shelf is where the reading happens.
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
      </div>
    </AppShell>
  );
}
