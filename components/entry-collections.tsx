"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  addToCollection,
  removeFromCollection,
  type CollectionState,
} from "@/app/actions/collections";
import { Button } from "@/components/ui/button";
import {
  collectionMembership,
  type CollectionTarget,
} from "@/lib/data/collection-items";

/**
 * Which collections this title is in, and a toggle per collection.
 *
 * The third way to file a title, and the only one that can also unfile it. The
 * picker on a collection page builds one list deliberately; the card menu is a
 * shortcut for the title under the pointer; this is the whole picture for one
 * title, which is the view that makes removing sensible.
 *
 * The card menu cannot remove: it closes on select, and an item that both
 * added and removed would change meaning under the pointer. Here the current
 * state stays visible while you act on it.
 *
 * Every collection is listed, in or out, rather than only the ones holding it.
 * A list of just the memberships answers "where is this" but not "where could
 * it go", and the second question is why the section gets opened.
 *
 * No "new collection" button: the one on /collections navigates to the new
 * collection on success, which would throw away the entry page the reader is
 * on. Making a collection is a trip to /collections; this section files into
 * the ones that exist.
 */
export function EntryCollections({
  titleId,
  collections,
}: {
  titleId: number;
  collections: CollectionTarget[];
}) {
  const membership = collectionMembership(collections, titleId);
  const inCount = membership.filter((m) => m.itemId !== null).length;

  return (
    // Anchor kept in step with #sources, so /entry/[id]#collections lands here.
    <section id="collections" className="grid gap-4">
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

      {collections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          A collection is any grouping that makes sense to you — comfort
          rereads, titles to recommend, the ones you keep meaning to finish.{" "}
          <Link href="/collections" className="underline hover:text-foreground">
            Make one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {membership.map((collection) => (
            <li key={collection.id}>
              <CollectionToggle
                // Keyed on membership: when the server comes back with a
                // different answer this remounts with it, rather than the
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

      {collections.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <Link href="/collections" className="hover:text-foreground">
            Manage your collections
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/**
 * One collection, as a pill that toggles membership.
 *
 * Two actions behind one control, chosen by whether an item id exists. They
 * are separate useActionState hooks rather than one dispatcher: each keeps its
 * own result, and a single hook would carry the last add's success into the
 * next remove and fire its effect on it immediately.
 *
 * The optimistic flip is local state rather than useOptimistic: the truth
 * arrives via router.refresh() re-rendering the page from the server, and
 * useOptimistic would snap back the moment the action settled but before that
 * refresh landed. The call site keys this on `itemId`, so a server answer that
 * disagrees remounts it instead of needing to be synced into state here.
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
      <input type="hidden" name="collection_id" value={collectionId} />
      {inCollection ? (
        <input type="hidden" name="item_id" value={itemId ?? ""} />
      ) : (
        <input type="hidden" name="title_id" value={titleId} />
      )}
      <Button
        type="submit"
        size="sm"
        variant={inCollection ? "secondary" : "outline"}
        disabled={pending}
        // The pressed state carries the meaning for a screen reader; the tick
        // and the fill carry it visually.
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
 *
 * Success is "no error", not a truthy flag: these actions answer with
 * `{ message }` on success and `{ error }` on failure.
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

    if (state.error) {
      toast.error(state.error);
      return;
    }
    onOk();
    router.refresh();
  }, [state, onOk, router]);
}
