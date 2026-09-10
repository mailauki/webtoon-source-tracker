import Link from "next/link";
import { Library, Tags } from "lucide-react";

import { getAdminCounts } from "@/lib/data/admin";

export const metadata = { title: "Admin" };

/**
 * Admin index: three counts and the two management areas.
 *
 * No verifyAdmin() call here — the layout already ran it, and the DAL's
 * cache() means a second call in this page would just be a redundant memo
 * hit, not a second real check. Same reasoning AppShell uses for
 * verifySession().
 *
 * Retired collections are included in the collections count (see
 * getAdminCounts / getAllCuratedCollections), so this number can be larger
 * than what /discover shows — that is the point of an admin-facing count.
 *
 * `taggedTitles` counts rows in title_tags, not distinct titles: a title
 * wearing three tags contributes three. The label says "tag assignments" for
 * that reason. The query is deliberately left alone — as a measure of how
 * much tagging has been done it is the more useful of the two numbers, and it
 * is one cheap count instead of a distinct scan.
 */
export default async function AdminPage() {
  const counts = await getAdminCounts();

  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage the curated collections and tags every reader sees on
          Discover.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/collections"
          className="grid gap-3 rounded-lg border border-border p-5 transition-colors hover:border-brand/50 hover:bg-accent/50"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Library className="size-4 text-muted-foreground" />
              <h2 className="font-display text-base font-bold">
                Collections
              </h2>
            </div>
            <span className="text-2xl font-bold tabular-nums">
              {counts.collections}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Curated shelves shown on Discover, retired ones included.
          </p>
        </Link>

        <Link
          href="/admin/tags"
          className="grid gap-3 rounded-lg border border-border p-5 transition-colors hover:border-brand/50 hover:bg-accent/50"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tags className="size-4 text-muted-foreground" />
              <h2 className="font-display text-base font-bold">Tags</h2>
            </div>
            <span className="text-2xl font-bold tabular-nums">
              {counts.tags}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {counts.taggedTitles} tag assignment
            {counts.taggedTitles === 1 ? "" : "s"} across the catalog.
          </p>
        </Link>
      </div>
    </div>
  );
}
