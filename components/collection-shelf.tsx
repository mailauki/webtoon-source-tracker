import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { CollectionCard } from "@/components/collection-card";
import type { Collection } from "@/lib/data/collection-items";

/**
 * One curated collection as a horizontally scrolling row.
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
  // The see-all page is keyed on the slug, which only curated rows carry. A
  // collection without one still renders — it just does not link anywhere.
  const href = collection.slug ? `/discover/${collection.slug}` : null;

  const heading = (
    <>
      <h2 className="font-display text-lg font-bold tracking-tight">
        {collection.name}
      </h2>
      {collection.description ? (
        <p className="text-sm text-muted-foreground">{collection.description}</p>
      ) : null}
    </>
  );

  return (
    <section className="grid gap-3">
      <div className="flex items-end justify-between gap-4">
        {href ? (
          // The whole heading block is the link, not just the chevron: it is a
          // larger target on a phone, and the chevron alone gives a screen
          // reader nothing to announce.
          <Link
            href={href}
            className="group grid gap-0.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {heading}
          </Link>
        ) : (
          <div className="grid gap-0.5">{heading}</div>
        )}

        {href ? (
          <Link
            href={href}
            aria-label={`See everything in ${collection.name}`}
            className="grid size-8 shrink-0 place-items-center rounded-pill border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>

      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {collection.items.map((item) => (
          <li key={item.id} className="w-[130px] shrink-0 snap-start">
            <CollectionCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
