"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Loader2, Tag as TagIcon, X } from "lucide-react";
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
 * no "No tags" row. Chips are a garnish; an absent garnish is not a gap. Only
 * an admin, who has something to do about an empty list, sees the editor.
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
  if (tags.length === 0 && !isAdmin) return null;

  const taggedIds = new Set(tags.map((tag) => tag.id));
  const untagged = allTags.filter((tag) => !taggedIds.has(tag.id));

  return (
    <section className="grid gap-3">
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id}>
              {isAdmin ? (
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

      {isAdmin ? (
        <AddTagPicker titleId={titleId} options={untagged} />
      ) : null}
    </section>
  );
}

/**
 * One applied tag, as a link that doubles as a remove button for an admin.
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
