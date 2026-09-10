import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CuratedItemList } from "@/components/admin/curated-item-list";
import { CuratedTitlePicker } from "@/components/admin/curated-title-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCuratedCollectionForAdmin,
  searchCatalogTitles,
} from "@/lib/data/admin";

export async function generateMetadata({
  params,
}: PageProps<"/admin/collections/[id]">) {
  const { id } = await params;
  const collection = await getCuratedCollectionForAdmin(Number(id));
  return { title: collection ? `${collection.name} · Admin` : "Not found" };
}

/**
 * One curated shelf: what is on it, in what order, and the controls to change
 * both.
 *
 * Keyed on the surrogate id rather than the slug, unlike
 * /discover/collection/[slug]. The slug is the reader-facing handle and is
 * deliberately immutable; the admin list has the row in hand and links by id,
 * so a shelf stays reachable here even while its slug is being reconsidered.
 *
 * The search term lives in `?q=` so the catalog query runs on the server — see
 * searchCatalogTitles for why this cannot filter rows already sent the way the
 * library picker does.
 *
 * Editing the shelf's own name and description is on /admin/collections
 * rather than here: that list is where a shelf is created, and keeping both
 * halves of "the row itself" in one dialog beats a second form that differs
 * only in where it sits.
 *
 * No verifyAdmin() call — app/admin/layout.tsx ran it, and the DAL's cache()
 * makes a second call a memo hit rather than a second real check.
 */
export default async function AdminCollectionPage({
  params,
  searchParams,
}: PageProps<"/admin/collections/[id]">) {
  const { id } = await params;
  const collectionId = Number(id);
  if (!Number.isInteger(collectionId) || collectionId <= 0) notFound();

  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";

  const [collection, results] = await Promise.all([
    getCuratedCollectionForAdmin(collectionId),
    searchCatalogTitles(query),
  ]);

  // getCuratedCollectionForAdmin filters `owner_id is null`, so a user's own
  // collection 404s here even for the admin who owns it — this route is for
  // editorial shelves, and the reader-facing page for a private one is
  // /collections/[id].
  //
  // A retired shelf is deliberately NOT a 404: this is where it gets
  // un-retired, so it has to survive its own retirement.
  if (!collection) notFound();

  return (
    <AppShell
      // Only the way out on this row: adding titles here is an inline search
      // form, not a button, so it stays with the results it filters.
      secondaryRow={
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="rounded-pill text-muted-foreground">
            <Link href="/admin/collections">
              <ArrowLeft data-icon="inline-start" />
              Collections
            </Link>
          </Button>
        </div>
      }
    >
    <div className="grid gap-6">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {collection.name}
          </h1>
          {collection.isActive ? null : (
            <Badge variant="outline">Retired</Badge>
          )}
        </div>
        {collection.description ? (
          <p className="text-sm text-muted-foreground">
            {collection.description}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          /discover/collection/{collection.slug} · {collection.items.length}{" "}
          {collection.items.length === 1 ? "title" : "titles"}
        </p>
      </div>

      <CuratedTitlePicker
        collectionId={collection.id}
        results={results}
        query={query}
        presentTitleIds={collection.items.map((item) => item.media_titles.id)}
      />

      <section className="grid gap-3">
        <h2 className="font-display text-base font-bold">On this shelf</h2>
        <CuratedItemList
          collectionId={collection.id}
          items={collection.items}
        />
      </section>
    </div>
    </AppShell>
  );
}
