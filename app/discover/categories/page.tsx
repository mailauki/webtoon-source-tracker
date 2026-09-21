import Link from "next/link";
import { ArrowLeft, Tags } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CategoryGrid } from "@/components/discover/category-grid";
import { Button } from "@/components/ui/button";
import { verifySession } from "@/lib/auth/dal";
import { groupByKind } from "@/lib/data/tag-items";
import { getActiveTags, getTaggedTitleCounts } from "@/lib/data/tags";

export const metadata = { title: "Categories" };

/**
 * Every category, as the way into the tag pages under /discover/tag/[slug].
 *
 * A static segment beside the dynamic `[slug]` one, the same arrangement
 * `tag/` already has: Next matches a static segment first, so `categories`
 * is the one slug a curated collection can never use. Worth knowing when
 * seeding one; `tag` has been spoken for on the same terms since the tags
 * migration.
 *
 * Its own page rather than a panel on /discover. The categories briefly sat
 * above the shelves there, and even capped to eight pills a kind they ran to
 * four rows before the first collection — which inverted what that page is
 * for. Here there is nothing to compete with, so every category shows at once
 * and /discover keeps a single link to this page instead.
 *
 * Signed-in only, like the rest of the app: `tags` is readable `to
 * authenticated` under tags_select_all.
 */
export default async function CategoriesPage() {
  await verifySession();

  const [tags, taggedCounts] = await Promise.all([
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

  const total = groups.reduce((sum, group) => sum + group.tags.length, 0);

  return (
    <AppShell
      // Same sticky back link the collection and tag pages use, so the way out
      // of a detail view is in the same place across the app.
      secondaryRow={
        <div className="flex items-center justify-between gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-pill text-muted-foreground"
          >
            <Link href="/discover">
              <ArrowLeft data-icon="inline-start" />
              Discover
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Categories
          </h1>
          <p className="text-sm text-muted-foreground">
            Every genre, trope, theme and format in the catalog — pick one to
            see what carries it.
          </p>
          {total > 0 ? (
            <p className="text-xs text-muted-foreground">
              {total} {total === 1 ? "category" : "categories"}
            </p>
          ) : null}
        </div>

        {groups.length === 0 ? (
          // Tags are admin-authored and MAL-seeded, so an empty page here
          // means nothing has been tagged yet rather than that anything
          // failed — the same reading /discover's own empty state gets.
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <Tags className="size-8 text-muted-foreground" />
            <h2 className="font-display text-lg font-bold">
              No categories yet
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Categories show up here once titles have been tagged. The curated
              collections are the way in for now.
            </p>
            <Link
              href="/discover"
              className="text-sm font-semibold text-brand hover:underline"
            >
              Back to Discover
            </Link>
          </div>
        ) : (
          <CategoryGrid groups={groups} />
        )}
      </div>
    </AppShell>
  );
}
