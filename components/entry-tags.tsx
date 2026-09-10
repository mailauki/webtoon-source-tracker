"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, Tag as TagIcon, X } from "lucide-react";
import { toast } from "sonner";

import { tagTitle, untagTitle, type TagState } from "@/app/actions/tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Tag } from "@/lib/data/tag-items";

/**
 * The title's tags, as chips linking to /discover/tag/<slug>, plus — for an
 * admin only — the picker that tags and untags from right here.
 *
 * isAdmin() is called once, on this page (app/entry/[id]/page.tsx), and the
 * boolean is threaded down as a prop. It is deliberately NOT called inside
 * this component or in AppShell: the spec calls for one admin check on one
 * page, not a check that runs on every render everywhere AppShell appears.
 *
 * A reader with no tags on this title sees nothing at all — no empty heading,
 * no "No tags" row. Chips are a garnish; an absent garnish is not a gap.
 *
 * An admin sees an Edit button, and the editing controls only after pressing
 * it. Two reasons it is a toggle rather than always-on:
 *
 *   1. Off is the reader's view, so an admin can see the page as it actually
 *      ships — and can follow a chip through to /discover/tag/<slug>, which
 *      an always-on remove button made impossible.
 *   2. Remove is a one-press destructive action sitting on a page whose job
 *      is reading. A mode you opt into keeps it off the path of someone who
 *      came here to check a chapter number.
 *
 * The button is rendered only when isAdmin — a reader never sees the control,
 * not even disabled.
 */
export function EntryTags({
  titleId,
  tags,
  allTags,
  isAdmin,
}: {
  titleId: number;
  /** Active tags already on this title. */
  tags: Tag[];
  /** Every active tag, for the admin's "add a tag" picker. Empty for a reader. */
  allTags: Tag[];
  isAdmin: boolean;
}) {
  // Hooks run before the early return: a component may not call fewer hooks on
  // one render than another. The reader's "nothing to show" case is decided
  // after, not by skipping useState.
  const [editing, setEditing] = useState(false);

  if (tags.length === 0 && !isAdmin) return null;

  const taggedIds = new Set(tags.map((tag) => tag.id));
  const untagged = allTags.filter((tag) => !taggedIds.has(tag.id));

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag.id}>
                {editing ? (
                  <RemovableTagChip titleId={titleId} tag={tag} />
                ) : (
                  <Link href={`/discover/tag/${tag.slug}`}>
                    <Badge variant="outline" className="hover:bg-muted">
                      {tag.name}
                    </Badge>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Rendered only for an admin — a reader never gets the control, not
            even disabled. aria-pressed rather than a label that says "on":
            this is a toggle, and that is the attribute a screen reader
            already knows how to announce. */}
        {isAdmin ? (
          <Button
            type="button"
            size="sm"
            variant={editing ? "secondary" : "ghost"}
            aria-pressed={editing}
            onClick={() => setEditing((on) => !on)}
            className="rounded-pill"
          >
            {editing ? (
              <Check className="size-3.5" />
            ) : (
              <Pencil className="size-3.5" />
            )}
            {editing ? "Done" : "Edit"}
          </Button>
        ) : null}
      </div>

      {isAdmin && editing ? (
        <AddTagPicker titleId={titleId} options={untagged} />
      ) : null}
    </section>
  );
}

/**
 * One applied tag in edit mode, as a button that removes it.
 *
 * Only rendered while editing is on; the same tag renders as a plain link to
 * its tag page otherwise. Keeping those two as separate branches rather than
 * one element that changes behaviour means the remove action cannot be
 * reached by a stray click on what looks like a link.
 *
 * Its own useActionState rather than one shared by the list: a single hook
 * would carry the previous chip's result into this one and fire its effect on
 * a chip nobody pressed — the same reason CollectionToggle and TagTitleRow
 * each keep their own.
 */
function RemovableTagChip({ titleId, tag }: { titleId: number; tag: Tag }) {
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
    // No local "removed" flag: the refresh drops this chip from the page
    // entirely, which is the honest end state — the same choice
    // TaggedTitleList makes for the admin tag page.
    router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="contents">
      <input type="hidden" name="tag_id" value={tag.id} />
      <input type="hidden" name="title_id" value={titleId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Remove tag ${tag.name}`}
        className="inline-flex items-center gap-1 rounded-4xl border border-border px-2 py-0.5 text-xs font-medium transition-colors hover:border-alert hover:text-alert disabled:opacity-60"
      >
        {tag.name}
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <X className="size-3" />
        )}
      </button>
    </form>
  );
}

/**
 * The admin's "add a tag" control: a native select plus a submit button.
 *
 * A native <select>, not the Radix one, for the same reason TagForm's kind
 * field is native: it is already a form control that lands in FormData on its
 * own, and this control's whole job is to produce FormData for tagTitle.
 *
 * Nothing to pick from (every active tag is already applied, or none exist)
 * collapses to a quiet hint rather than a disabled control with nothing to say.
 */
function AddTagPicker({
  titleId,
  options,
}: {
  titleId: number;
  options: Tag[];
}) {
  const router = useRouter();

  const [state, action, pending] = useActionState<TagState, FormData>(
    tagTitle,
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
    router.refresh();
  }, [state, router]);

  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {/* Either every active tag is already on this title, or there are no
            active tags at all — either way there is nothing left to offer. */}
        <TagIcon className="mr-1 inline size-3" />
        No more tags to add.
      </p>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="title_id" value={titleId} />
      <select
        // Keyed on the option set: once a tag is applied it drops out of
        // `options` and the select remounts to its blank default, rather than
        // an uncontrolled DOM select holding on to a value that no longer has
        // a matching <option> once the just-picked tag disappears from the
        // list on refresh.
        key={options.map((tag) => tag.id).join(",")}
        name="tag_id"
        aria-label="Add a tag"
        defaultValue=""
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="" disabled>
          Add a tag…
        </option>
        {options.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        className="rounded-pill"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <TagIcon className="size-3.5" />}
        Tag
      </Button>
    </form>
  );
}
