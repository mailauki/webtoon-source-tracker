"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

import { addEntry, type AddEntryState } from "@/app/actions/add-entry";
import { Button } from "@/components/ui/button";
import type { CollectionItem } from "@/lib/data/collection-items";

/**
 * One title on a curated shelf.
 *
 * Two states, and the second is the point of the surface: a title already on
 * the shelf links to its entry page, and one that is not offers to be added.
 * The cover treatment matches EntryCard — 1:2 portrait, bottom-up scrim,
 * title lettered over the art — so a curated row reads as the same kind of
 * object as the library grid rather than as a separate widget.
 *
 * A Client Component only because of the add button. The cover and title would
 * render fine on the server; splitting them would mean two components sharing
 * one layout, for the sake of a card that is mostly a button.
 */
export function CollectionCard({ item }: { item: CollectionItem }) {
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
    <div className="group/card grid gap-1.5">
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
    </div>
  );
}
