"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Layers, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  addToCollection,
  removeFromCollection,
  type CollectionState,
} from "@/app/actions/collections";
import { CollectionForm } from "@/components/collection-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  collectionMembership,
  type CollectionTarget,
} from "@/lib/data/collection-items";

/**
 * Which collections this title is in, and a toggle per collection.
 *
 * The card menu can only add — it closes on select, and an item that both adds
 * and removes would be a menu whose meaning changes under the pointer. The
 * entry page is where the whole picture fits, so this is the surface that can
 * take a title back out, and the one that shows membership without asking you
 * to open each collection to find out.
 *
 * Every collection is listed, in or out, rather than only the ones holding it.
 * A list of just the memberships answers "where is this" but not "where could
 * it go", and the second question is why anyone opens this section.
 */
export function EntryCollections({
  titleId,
  collections,
}: {
  titleId: number;
  collections: CollectionTarget[];
}) {
  const [creating, setCreating] = useState(false);
  const membership = collectionMembership(collections, titleId);
  const inCount = membership.filter((m) => m.itemId !== null).length;

  return (
    // Anchor kept in step with #sources, so /entry/[id]#collections lands here.
    <section id="collections" className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">In collections</h2>
          <p className="text-sm text-muted-foreground">
            {collections.length === 0
              ? "You haven't made any collections yet."
              : inCount === 0
                ? "Not in any of your collections."
                : `In ${inCount} of ${collections.length}.`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCreating(true)}
          className="shrink-0 rounded-pill"
        >
          <Plus className="size-4" />
          New collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          A collection is any grouping that makes sense to you — comfort
          rereads, titles to recommend, the ones you keep meaning to finish.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {membership.map((collection) => (
            <li key={collection.id}>
              <CollectionToggle
                // Keyed on membership: when the server comes back with a
                // different answer this remounts with it, instead of the
                // optimistic local state outliving the refresh.
                key={collection.itemId ?? "out"}
                titleId={titleId}
                collectionId={collection.id}
                name={collection.name}
                itemId={collection.itemId}
              />
            </li>
          ))}
        </ul>
      )}

      {inCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          <Link href="/collections" className="hover:text-foreground">
            Manage your collections
          </Link>
        </p>
      ) : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              It starts empty — add this title with the button beside it once
              it exists.
            </DialogDescription>
          </DialogHeader>
          {creating ? (
            <CollectionForm key="create" onDone={() => setCreating(false)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * One collection, as a pill that toggles membership.
 *
 * Two actions behind one control, chosen by whether an item id exists. They
 * are separate useActionState hooks rather than one dispatcher: each keeps its
 * own result, and a single hook would carry the last add's success into the
 * next remove and fire its effect immediately.
 *
 * The optimistic flip is local state, not useOptimistic: the truth arrives via
 * router.refresh() re-rendering the page from the server, and useOptimistic
 * would snap back the moment the action settled but before the refresh landed.
 */
function CollectionToggle({
  titleId,
  collectionId,
  name,
  itemId,
}: {
  titleId: number;
  collectionId: number;
  name: string;
  itemId: number | null;
}) {
  const router = useRouter();

  // Mirrors the server's answer until the refresh brings the real one. The
  // call site keys this component on `itemId`, so a server answer that
  // disagrees remounts it rather than needing to be synced into state here —
  // which is what keeps a refresh triggered elsewhere (the library's card
  // menu, a second tab) from leaving a stale pill behind.
  const [inCollection, setInCollection] = useState(itemId !== null);

  const [addState, add, adding] = useActionState<CollectionState, FormData>(
    addToCollection,
    null,
  );
  const [removeState, remove, removing] = useActionState<
    CollectionState,
    FormData
  >(removeFromCollection, null);

  const pending = adding || removing;

  useSettled(addState, () => setInCollection(true), router);
  useSettled(removeState, () => setInCollection(false), router);

  return (
    <form action={inCollection ? remove : add}>
      {inCollection ? (
        <>
          <input type="hidden" name="item_id" value={itemId ?? ""} />
          <input type="hidden" name="collection_id" value={collectionId} />
        </>
      ) : (
        <>
          <input type="hidden" name="collection_id" value={collectionId} />
          <input type="hidden" name="title_id" value={titleId} />
        </>
      )}
      <Button
        type="submit"
        size="sm"
        variant={inCollection ? "secondary" : "outline"}
        disabled={pending}
        // The label carries the whole state: a pressed pill reads as "in", and
        // aria-pressed says the same thing to a screen reader.
        aria-pressed={inCollection}
        className="rounded-pill"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : inCollection ? (
          <Check className="size-3.5" />
        ) : (
          <Layers className="size-3.5" />
        )}
        {name}
      </Button>
    </form>
  );
}

/**
 * Runs `onOk` once when an action settles, and reports a failure.
 *
 * The guard matters: useActionState keeps its result for the life of the
 * component, so an unguarded effect re-fires on every following render — and
 * because it refreshes, that is a loop rather than a stray call.
 */
function useSettled(
  state: CollectionState,
  onOk: () => void,
  router: ReturnType<typeof useRouter>,
) {
  const handled = useRef<CollectionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.ok) {
      onOk();
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, onOk, router]);
}
