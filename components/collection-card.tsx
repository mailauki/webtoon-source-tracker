"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";

import { addEntry, type AddEntryState } from "@/app/actions/add-entry";
import {
  removeFromCollection,
  type CollectionState,
} from "@/app/actions/collections";
import { Button } from "@/components/ui/button";
import type { CollectionItem } from "@/lib/data/collection-items";

/**
 * One title on a collection shelf or grid.
 *
 * Two states, and the second is the point of the surface: a title already in
 * the library links to its entry page, one that is not offers to be added.
 * The cover treatment matches EntryCard — 1:2 portrait, bottom-up scrim,
 * title lettered over the art — so a collection reads as the same kind of
 * object as the library grid rather than as a separate widget.
 *
 * `removable` turns the card into an editable one, for a collection the viewer
 * owns. It carries the collection id rather than a callback: a Server
 * Component renders these on both /discover and /collections, and a function
 * prop across that boundary throws at runtime (see tests/rsc-boundary.test.ts).
 *
 * A Client Component only because of those two buttons. The cover and title
 * would render fine on the server; splitting them would mean two components
 * sharing one layout for the sake of a card that is mostly its controls.
 */
export function CollectionCard({
  item,
  removable,
}: {
  item: CollectionItem;
  removable?: { collectionId: number };
}) {
  const title = item.media_titles;
  const router = useRouter();

  // The action revalidates /library, and router.refresh() below re-renders
  // this page — but the refreshed props only arrive after a round trip, and
  // the button has to stop saying "Add" the moment the add succeeds.
  const [added, setAdded] = useState(false);

  const [state, action, pending] = useActionState<AddEntryState, FormData>(
    addEntry,
    null,
  );

  const [removeState, removeAction, removing] = useActionState<
    CollectionState,
    FormData
  >(removeFromCollection, null);

  // `state` keeps its successful value for the life of the component, so
  // without this guard the effect re-fires on every following render — and
  // since it calls router.refresh(), which causes another render, that is a
  // loop rather than a stray extra call. Same shape as MalResultCard.
  const handled = useRef(false);

  useEffect(() => {
    if (!state?.ok || handled.current) return;
    handled.current = true;
    setAdded(true);
    router.refresh();
  }, [state, router]);

  const tracked = item.entryId !== null;

  const cover = (
    <div className="relative aspect-[1/2] overflow-hidden rounded-md bg-muted ring-offset-background group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
      {title.main_picture_url ? (
        <Image
          src={title.main_picture_url}
          alt=""
          fill
          sizes="(max-width: 640px) 40vw, (max-width: 1024px) 25vw, 150px"
          className="object-cover transition-transform duration-200 group-hover/card:scale-105"
        />
      ) : (
        <div className="flex h-full items-center justify-center p-2">
          <span className="text-center font-display text-xs font-semibold text-muted-foreground">
            {title.title}
          </span>
        </div>
      )}

      {/* Bottom-up scrim so white text stays legible over any artwork. */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

      {tracked || added ? (
        <div className="absolute inset-x-0 top-0 flex p-1.5">
          <span className="inline-flex items-center gap-1 rounded-pill bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            <Check className="size-3" />
            In library
          </span>
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 p-2">
        <h3 className="line-clamp-3 text-center font-display text-sm font-bold leading-tight text-white drop-shadow">
          {title.title}
        </h3>
      </div>
    </div>
  );

  return (
    <div className="group/card relative grid gap-1.5">
      {tracked ? (
        <Link
          href={`/entry/${item.entryId}`}
          className="group block focus-visible:outline-none"
        >
          {cover}
        </Link>
      ) : (
        cover
      )}

      {/* Sits outside the link above: a nested anchor/button would be hoisted
          out by the HTML parser and break hydration. Always rendered rather
          than revealed on hover, since a touch device has no hover. */}
      {removable ? (
        <form action={removeAction} className="absolute right-1.5 top-1.5">
          <input type="hidden" name="item_id" value={item.id} />
          <input
            type="hidden"
            name="collection_id"
            value={removable.collectionId}
          />
          <button
            type="submit"
            disabled={removing}
            aria-label={`Remove ${title.title} from this collection`}
            className="grid size-6 place-items-center rounded-pill bg-black/60 text-white backdrop-blur transition-colors hover:bg-alert disabled:opacity-50"
          >
            {removing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
          </button>
        </form>
      ) : null}

      {/* The editorial line, when there is one. It is what makes a curated
          shelf curated rather than a filtered list, so it sits under every
          card that has one — including the ones already in the library. */}
      {item.note ? (
        <p className="line-clamp-2 px-0.5 text-xs text-muted-foreground">
          {item.note}
        </p>
      ) : null}

      {tracked || added ? null : (
        <form action={action}>
          <input type="hidden" name="mal_media_id" value={title.mal_media_id} />
          {/* Discovery adds a title to read later, never one in progress. */}
          <input type="hidden" name="list_status" value="plan_to_read" />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={pending}
            className="w-full rounded-pill text-xs"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Add
          </Button>
        </form>
      )}

      {state && !state.ok ? (
        <p role="alert" className="px-0.5 text-xs text-alert">
          {state.error}
        </p>
      ) : null}

      {removeState?.error ? (
        <p role="alert" className="px-0.5 text-xs text-alert">
          {removeState.error}
        </p>
      ) : null}
    </div>
  );
}
