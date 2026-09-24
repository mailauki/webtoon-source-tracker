import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { EntryCard } from "@/components/entry-card";
import { collectionView } from "@/lib/data/entry-view";
import type { Collection } from "@/lib/data/collection-items";

/**
 * Where a collection's see-all page lives.
 *
 * Keyed on the slug for a curated row and the id for the viewer's own —
 * collections_shape_ck gives every curated row a slug and no user row one, so
 * the slug alone says which kind this is.
 */
export function collectionHref(collection: Pick<Collection, "id" | "slug">) {
  return collection.slug
    ? `/discover/${collection.slug}`
    : `/discover/collections/${collection.id}`;
}

/**
 * One collection — curated or the viewer's own — as a horizontally scrolling
 * row.
 *
 * The shelf scrolls sideways rather than wrapping, so several collections fit
 * on one screen and each stays one row tall however many titles it holds. The
 * negative margin lets the row bleed to the viewport edge inside AppShell's
 * padded main, which is what makes a partially-visible card at the right edge
 * read as "there is more this way" rather than as a clipped layout.
 *
 * A Server Component: the cards below are client-side for their add button,
 * but nothing here is, and the shelf is the part that renders per collection.
 */
export function CollectionShelf({ collection }: { collection: Collection }) {
  const href = collectionHref(collection);

  const heading = (
    <>
      <h3 className="font-display text-lg font-bold tracking-tight">
        {collection.name}
      </h3>
      {collection.description ? (
        <p className="text-sm text-muted-foreground">
          {collection.description}
        </p>
      ) : null}
    </>
  );

  return (
    <section className="grid gap-3">
      <div className="flex items-end justify-between gap-4">
        {/* The whole heading block is the link, not just the chevron: it is a
            larger target on a phone, and the chevron alone gives a screen
            reader nothing to announce. */}
        <Link
          href={href}
          className="group grid gap-0.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {heading}
        </Link>

        <Link
          href={href}
          aria-label={`See everything in ${collection.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-pill border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {collection.items.length === 0 ? (
        // Only the viewer's own shelves reach here empty — curated ones are
        // dropped when they have nothing to show. A just-made collection
        // still wants a row, and a way into the page that fills it.
        <Link
          href={href}
          className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Nothing in here yet — open it to add titles from your library.
        </Link>
      ) : (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {collection.items.map((item) => (
            <li key={item.id} className="w-[130px] shrink-0 snap-start">
              <EntryCard view={collectionView(item)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
