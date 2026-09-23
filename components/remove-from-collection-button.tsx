"use client";

import { useActionState } from "react";
import { Loader2, X } from "lucide-react";

import {
  removeFromCollection,
  type CollectionState,
} from "@/app/actions/collections";

/**
 * Takes one title back off a collection the viewer owns.
 *
 * Carries the collection id rather than a callback: a Server Component
 * renders these on both /discover and /collections, and a function prop
 * across that boundary throws at runtime (see tests/rsc-boundary.test.ts).
 *
 * Lifted out of CollectionCard when the card was unified, alongside
 * AddTitleButton — the two are the collection surfaces' own actions, and
 * keeping them here means the shared card does not import a server action for
 * a branch the library never takes.
 */
export function RemoveFromCollectionButton({
  itemId,
  collectionId,
  name,
}: {
  /** The `collection_items` id — the placement, not the catalog title. */
  itemId: number;
  collectionId: number;
  name: string;
}) {
  const [state, action, pending] = useActionState<CollectionState, FormData>(
    removeFromCollection,
    null,
  );

  return (
    <>
      <form action={action}>
        <input type="hidden" name="item_id" value={itemId} />
        <input type="hidden" name="collection_id" value={collectionId} />
        <button
          type="submit"
          disabled={pending}
          aria-label={`Remove ${name} from this collection`}
          className="grid size-6 place-items-center rounded-pill bg-black/60 text-white backdrop-blur transition-colors hover:bg-alert disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <X className="size-3.5" />
          )}
        </button>
      </form>

      {state?.error ? (
        <p role="alert" className="px-0.5 text-xs text-alert">
          {state.error}
        </p>
      ) : null}
    </>
  );
}
