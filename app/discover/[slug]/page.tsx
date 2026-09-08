import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CollectionCard } from "@/components/collection-card";
import { verifySession } from "@/lib/auth/dal";
import { getCuratedCollection } from "@/lib/data/collections";

export async function generateMetadata({
  params,
}: PageProps<"/discover/[slug]">) {
  const { slug } = await params;
  const collection = await getCuratedCollection(slug);
  return { title: collection ? collection.name : "Not found" };
}

/**
 * Everything in one curated collection — the shelf's "see all".
 *
 * A grid rather than the sideways row: this page exists precisely because the
 * shelf could not show the whole thing.
 */
export default async function CollectionPage({
  params,
}: PageProps<"/discover/[slug]">) {
  await verifySession();

  const { slug } = await params;
  const collection = await getCuratedCollection(slug);

  // Covers three cases that should be indistinguishable from outside: no such
  // slug, a collection that has been retired (is_active false), and a user
  // collection whose slug was guessed — user rows have no slug at all, so they
  // can never be reached here.
  if (!collection) notFound();

  return (
    <AppShell
      secondaryRow={
        // Same sticky back link the entry page uses, so the way out of a
        // detail view is in the same place across the app.
        <Link
          href="/discover"
          className="inline-flex items-center gap-1 rounded-pill border border-border bg-background/60 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Discover
        </Link>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {collection.name}
          </h1>
          {collection.description ? (
            <p className="text-sm text-muted-foreground">
              {collection.description}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {collection.items.length}{" "}
            {collection.items.length === 1 ? "title" : "titles"}
          </p>
        </div>

        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {collection.items.map((item) => (
            <li key={item.id}>
              <CollectionCard item={item} />
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
