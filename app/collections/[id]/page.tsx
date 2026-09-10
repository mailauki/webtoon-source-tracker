import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { CollectionCard } from "@/components/collection-card";
import { AddTitlesDialog } from "@/components/collections/add-titles-dialog";
import { CollectionHeader } from "@/components/collections/collection-header";
import { verifySession } from "@/lib/auth/dal";
import { getLibraryTitles, getMyCollection } from "@/lib/data/collections";

export async function generateMetadata({
  params,
}: PageProps<"/collections/[id]">) {
  const { id } = await params;
  const collection = await getMyCollection(Number(id));
  return { title: collection ? collection.name : "Not found" };
}

/**
 * One of the viewer's own collections: what is in it, and the controls to
 * change that.
 *
 * The route is keyed on the surrogate id rather than a slug because user
 * collections have no slug — collections_shape_ck reserves that for curated
 * rows, which live under /discover.
 */
export default async function MyCollectionPage({
  params,
}: PageProps<"/collections/[id]">) {
  await verifySession();

  const { id } = await params;
  const collectionId = Number(id);
  if (!Number.isInteger(collectionId) || collectionId <= 0) notFound();

  const [collection, library] = await Promise.all([
    getMyCollection(collectionId),
    getLibraryTitles(),
  ]);

  // RLS makes "does not exist" and "belongs to someone else" indistinguishable,
  // which is what we want: both 404 rather than confirming existence.
  if (!collection) notFound();

  return (
    <AppShell
      // The way out and the one way in sit on the same sticky row, justified
      // apart: adding titles is this page's whole job, so the control follows
      // the reader down a long shelf rather than scrolling off the top.
      secondaryRow={
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="rounded-pill text-muted-foreground">
            <Link href="/collections">
              <ArrowLeft data-icon="inline-start" />
              Collections
            </Link>
          </Button>
          <AddTitlesDialog
            collectionId={collection.id}
            library={library}
            presentTitleIds={collection.items.map(
              (item) => item.media_titles.id,
            )}
          />
        </div>
      }
    >
      <div className="grid gap-6">
        <CollectionHeader
          collection={{
            id: collection.id,
            name: collection.name,
            description: collection.description,
          }}
          itemCount={collection.items.length}
        />

        {collection.items.length === 0 ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-lg font-bold">Nothing in here yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add titles from your library to start building this collection.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {collection.items.map((item) => (
              <li key={item.id}>
                <CollectionCard
                  item={item}
                  removable={{ collectionId: collection.id }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
