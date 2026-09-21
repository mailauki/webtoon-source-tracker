import Link from "next/link";
import { Compass } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CollectionShelf } from "@/components/collection-shelf";
import { CategoryNav } from "@/components/discover/category-nav";
import { verifySession } from "@/lib/auth/dal";
import { getCuratedShelves } from "@/lib/data/collections";
import { groupByKind } from "@/lib/data/tag-items";
import { getActiveTags, getTaggedTitleCounts } from "@/lib/data/tags";

export const metadata = { title: "Discover" };

/**
 * Curated collections, as stacked shelves, over a category index.
 *
 * Deliberately separate from /library. The library is your own shelf and
 * already carries status chips, source chips, sort, hide-hiatus and search;
 * discovery is a different question ("what should I read next") asked of a
 * different set of rows — titles you may not track at all. Putting these
 * shelves above the grid would have crowded both.
 *
 * The categories above them are navigation, not a filter over the shelves:
 * each pill opens /discover/tag/[slug], the page that already answers
 * "everything carrying this tag". Those pages existed before this panel did
 * but could only be reached from a chip on a title you had already opened,
 * which is the wrong way round for browsing. The collections stay the page's
 * content; the index is four short rows above them.
 *
 * Signed-in only, like the rest of the app: every RLS policy here is
 * `to authenticated`, so an anonymous visitor would see neither the
 * collections nor the covers.
 */
export default async function DiscoverPage() {
  await verifySession();

  const [shelves, tags, taggedCounts] = await Promise.all([
    getCuratedShelves(),
    getActiveTags(),
    getTaggedTitleCounts(),
  ]);

  // A tag no title carries is dropped before grouping: its page would be an
  // empty grid, and an empty page reached from a deliberate press reads as a
  // broken link rather than as an honest "nothing here yet". groupByKind then
  // drops any kind left with nothing.
  const groups = groupByKind(
    tags.filter((tag) => (taggedCounts.get(tag.id) ?? 0) > 0),
  );

  return (
    <AppShell>
      <div className="grid gap-8">
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Discover
          </h1>
          <p className="text-sm text-muted-foreground">
            Collections of titles worth a look — add any of them straight to
            your library.
          </p>
        </div>

        <CategoryNav groups={groups} />

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
