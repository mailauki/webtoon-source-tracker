import Image from "next/image";
import Link from "next/link";
import { Library } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { NewCollection } from "@/components/collections/new-collection";
import { verifySession } from "@/lib/auth/dal";
import { getMyCollections } from "@/lib/data/collections";
import type { CollectionSummary } from "@/lib/data/collections";

export const metadata = { title: "Collections" };

/**
 * The viewer's own collections.
 *
 * The counterpart to /discover: that page is editorial and read-only, this one
 * is entirely the viewer's. They share the `collections` table and differ only
 * by whether owner_id is null.
 */
export default async function CollectionsPage() {
  await verifySession();

  const collections = await getMyCollections();

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Collections
            </h1>
            <p className="text-sm text-muted-foreground">
              Your own groupings, private to you.
            </p>
          </div>
          <NewCollection />
        </div>

        {collections.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <Library className="size-8 text-muted-foreground" />
            <h2 className="font-display text-lg font-bold">
              No collections yet
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Make one for anything you want to keep together — comfort
              rereads, a shortlist for a friend, everything you started and
              never finished.
            </p>
            <Link
              href="/discover"
              className="text-sm font-semibold text-brand hover:underline"
            >
              Or see what&rsquo;s on Discover
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <li key={collection.id}>
                <CollectionCardLink collection={collection} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

/**
 * One collection on the index: a mosaic of what is in it, then its name.
 *
 * The mosaic is a fixed four cells so every card is the same height whether
 * the collection holds two titles or forty. Empty cells stay as the muted
 * ground rather than stretching the covers that exist.
 */
function CollectionCardLink({
  collection,
}: {
  collection: CollectionSummary;
}) {
  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group grid gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="grid aspect-[3/2] grid-cols-4 gap-0.5 overflow-hidden rounded-lg border border-border bg-muted">
        {Array.from({ length: 4 }).map((_, i) => {
          const cover = collection.covers[i];
          return (
            <div key={i} className="relative bg-muted">
              {cover ? (
                <Image
                  src={cover}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 25vw, 120px"
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-0.5">
        <h2 className="truncate font-display text-base font-bold tracking-tight">
          {collection.name}
        </h2>
        {collection.description ? (
          <p className="truncate text-sm text-muted-foreground">
            {collection.description}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {collection.itemCount}{" "}
          {collection.itemCount === 1 ? "title" : "titles"}
        </p>
      </div>
    </Link>
  );
}
