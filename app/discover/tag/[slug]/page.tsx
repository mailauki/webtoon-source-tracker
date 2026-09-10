import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CollectionCard } from "@/components/collection-card";
import { verifySession } from "@/lib/auth/dal";
import { getTrackedEntries } from "@/lib/data/collections";
import { getTagBySlug, getTitlesForTag } from "@/lib/data/tags";

export async function generateMetadata({
  params,
}: PageProps<"/discover/tag/[slug]">) {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  return { title: tag ? tag.name : "Not found" };
}

/**
 * Every catalog title carrying one tag — browse-by-tag's "see all".
 *
 * Modeled on app/discover/[slug]/page.tsx, the curated-collection detail page.
 * getTagBySlug already filters on is_active, so notFound() here covers both
 * an unknown slug and a retired tag with the same call: is_active is how a
 * tag is withdrawn, and a retired one should stop being a reachable page.
 */
export default async function TagPage({
  params,
}: PageProps<"/discover/tag/[slug]">) {
  await verifySession();

  const { slug } = await params;
  const tag = await getTagBySlug(slug);

  if (!tag) notFound();

  const [titles, tracked] = await Promise.all([
    getTitlesForTag(tag.id),
    getTrackedEntries(),
  ]);

  return (
    <AppShell
      secondaryRow={
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
            {tag.name}
          </h1>
          {tag.description ? (
            <p className="text-sm text-muted-foreground">{tag.description}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {titles.length} {titles.length === 1 ? "title" : "titles"}
          </p>
        </div>

        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {titles.map((title) => (
            <li key={title.id}>
              <CollectionCard
                item={{
                  // There is no collection_items row here — a tag link is not
                  // a shelf placement — so the catalog id doubles as the React
                  // key. `removable` is never passed for this page, so
                  // CollectionCard never reads this id to build a remove form.
                  id: title.id,
                  position: 0,
                  note: null,
                  media_titles: title,
                  entryId: tracked.get(title.id) ?? null,
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
