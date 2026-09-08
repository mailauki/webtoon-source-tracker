import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CollectionCard } from "@/components/collection-card";
import { verifySession } from "@/lib/auth/dal";
import { getMyCollection } from "@/lib/data/collections";

export async function generateMetadata({
  params,
}: PageProps<"/collections/mine/[id]">) {
  const { id } = await params;
  const collection = await getMyCollection(Number(id));
  return { title: collection ? collection.name : "Not found" };
}

export default async function MyCollectionPage({
  params,
}: PageProps<"/collections/mine/[id]">) {
  await verifySession();

  const { id } = await params;
  const collectionId = Number(id);
  if (!Number.isInteger(collectionId) || collectionId <= 0) notFound();

  const collection = await getMyCollection(collectionId);

  // RLS makes "does not exist" and "belongs to someone else" indistinguishable
  // here, which is what we want: both 404 rather than confirming existence.
  if (!collection) notFound();

  return (
    <AppShell
      secondaryRow={
        <Link
          href="/collections"
          className="inline-flex items-center gap-1 rounded-pill border border-border bg-background/60 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Collections
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

        {collection.items.length === 0 ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Nothing in here yet. Right-click (or long-press) any card in your
              library and pick this collection.
            </p>
            <Link
              href="/library"
              className="text-sm font-semibold text-brand hover:underline"
            >
              Go to your library
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {collection.items.map((item) => (
              <li key={item.id}>
                {/* `removableFrom` turns the card's add button into a remove
                    one: inside a collection you own, taking a title out is the
                    action that belongs on it. */}
                <CollectionCard item={item} removableFrom={collection.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
