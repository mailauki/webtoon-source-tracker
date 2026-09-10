"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  moveCuratedItem,
  removeTitleFromCurated,
  type AdminCollectionState,
} from "@/app/actions/admin-collections";
import type { CollectionItem } from "@/lib/data/collection-items";

/**
 * The titles on one curated shelf, in shelf order, with the controls to
 * reorder and remove them.
 *
 * Up/down buttons rather than drag-and-drop. Two buttons work with a keyboard
 * and a screen reader without a single line of extra code, and reordering a
 * dozen-item editorial shelf is not the kind of task that repays a drag
 * implementation — moveCuratedItem swaps one adjacent pair per press, which
 * is exactly what these two buttons ask for.
 *
 * The order shown is the server's: the page re-renders from it after every
 * move. There is no optimistic reorder, because a swap that the action
 * silently declines (the top item pressed "up") would leave the list showing
 * a move that never happened.
 */
export function CuratedItemList({
  collectionId,
  items,
}: {
  collectionId: number;
  items: CollectionItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nothing on this shelf yet. Search the catalog above to add the first
        title.
      </p>
    );
  }

  return (
    <ol className="grid gap-1">
      {items.map((item, index) => (
        <li key={item.id}>
          <CuratedItemRow
            collectionId={collectionId}
            item={item}
            position={index + 1}
            isFirst={index === 0}
            isLast={index === items.length - 1}
          />
        </li>
      ))}
    </ol>
  );
}

/**
 * One item on the shelf.
 *
 * Two separate useActionState hooks — one for move, one for remove — rather
 * than one shared dispatcher: a single hook would carry the previous press's
 * result into the next and fire its effect on it immediately. Same reason
 * CollectionToggle keeps two rather than switching one.
 *
 * Both directions share `move`, because they cannot overlap: a press disables
 * the whole row until it settles, and the only thing that distinguishes them
 * is a hidden field the submitted form carries.
 */
function CuratedItemRow({
  collectionId,
  item,
  position,
  isFirst,
  isLast,
}: {
  collectionId: number;
  item: CollectionItem;
  position: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const title = item.media_titles;

  const [moveState, move, moving] = useActionState<
    AdminCollectionState,
    FormData
  >(
    // moveCuratedItem answers `null` on success — including the silent no-op
    // when the top item is pressed "up" — and a null state is indistinguishable
    // from "nothing has been submitted yet", so the effect below would never
    // fire and the new order would never be fetched. Wrapping it turns that
    // success into a state the effect can see. Same wrap-the-action shape
    // CollectionHeader uses to close its dialog on save.
    async (prev, formData) => (await moveCuratedItem(prev, formData)) ?? {},
    null,
  );

  const [removeState, remove, removing] = useActionState<
    AdminCollectionState,
    FormData
  >(removeTitleFromCurated, null);

  useSettled(moveState, router);
  useSettled(removeState, router);

  const pending = moving || removing;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {position}
      </span>

      <div className="relative h-14 w-9 shrink-0 overflow-hidden rounded bg-muted">
        {title.main_picture_url ? (
          <Image
            src={title.main_picture_url}
            alt=""
            fill
            sizes="36px"
            className="object-cover"
          />
        ) : null}
      </div>

      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {title.title}
      </span>

      <form action={move} className="flex shrink-0 items-center">
        <input type="hidden" name="collection_id" value={collectionId} />
        <input type="hidden" name="item_id" value={item.id} />
        <button
          type="submit"
          name="direction"
          value="up"
          disabled={isFirst || pending}
          aria-label={`Move ${title.title} up`}
          className="inline-flex size-8 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          disabled={isLast || pending}
          aria-label={`Move ${title.title} down`}
          className="inline-flex size-8 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <ChevronDown className="size-4" />
        </button>
      </form>

      <form action={remove} className="shrink-0">
        <input type="hidden" name="collection_id" value={collectionId} />
        <input type="hidden" name="item_id" value={item.id} />
        <button
          type="submit"
          disabled={pending}
          aria-label={`Remove ${title.title} from this collection`}
          className="inline-flex size-8 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:bg-muted hover:text-alert disabled:opacity-60"
        >
          {removing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
        </button>
      </form>
    </div>
  );
}

/**
 * Refreshes once when an action settles, and reports a failure.
 *
 * The guard matters: useActionState keeps its result for the life of the
 * component, so an unguarded effect re-fires on every following render — and
 * because it refreshes, that is a loop rather than a stray call.
 */
function useSettled(
  state: AdminCollectionState,
  router: ReturnType<typeof useRouter>,
) {
  const handled = useRef<AdminCollectionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) {
      toast.error(state.error);
      return;
    }
    router.refresh();
  }, [state, router]);
}
