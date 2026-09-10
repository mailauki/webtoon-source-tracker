"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { untagTitle, type TagState } from "@/app/actions/tags";
import type { CollectionTitle } from "@/lib/data/collection-items";

/**
 * The titles carrying one tag, each with the control that takes it off.
 *
 * Removing is not confirmed. Unlike deleting a collection, a tag on a title
 * carries no hand-made data — putting it back is the same one click that took
 * it off, and the picker directly above is where that click lives.
 */
export function TaggedTitleList({
  tagId,
  titles,
}: {
  tagId: number;
  titles: CollectionTitle[];
}) {
  if (titles.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nothing carries this tag yet. Search the catalog above to add the first
        title.
      </p>
    );
  }

  return (
    <ul className="grid gap-1">
      {titles.map((title) => (
        <li key={title.id}>
          <TaggedTitleRow tagId={tagId} title={title} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One tagged title.
 *
 * Its own useActionState, so a failure names the row it belongs to rather
 * than the last row that was pressed.
 */
function TaggedTitleRow({
  tagId,
  title,
}: {
  tagId: number;
  title: CollectionTitle;
}) {
  const router = useRouter();

  const [state, action, pending] = useActionState<TagState, FormData>(
    untagTitle,
    null,
  );

  const handled = useRef<TagState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) {
      toast.error(state.error);
      return;
    }
    // No local "removed" flag: the refresh drops this row from the page
    // entirely, which is the honest end state — a row that stayed but greyed
    // out would be claiming the tag is still there.
    router.refresh();
  }, [state, router]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
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
      <form action={action}>
        <input type="hidden" name="tag_id" value={tagId} />
        <input type="hidden" name="title_id" value={title.id} />
        <button
          type="submit"
          disabled={pending}
          aria-label={`Remove tag from ${title.title}`}
          className="inline-flex size-8 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:bg-muted hover:text-alert disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
        </button>
      </form>
    </div>
  );
}
