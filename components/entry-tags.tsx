"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Lightbulb, Loader2, Pencil, Tag as TagIcon, X } from "lucide-react";
import { toast } from "sonner";

import { suggestTag } from "@/app/actions/suggestions";
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
 * A reader gets the same toggle as "Suggest" instead: the picker files a
 * suggestion an admin approves on /admin/suggestions, and the reader's
 * pending ones show as dashed chips until then.
 */
export function EntryTags({
  titleId,
  tags,
  savedTagIds,
  lockedTagIds,
  allTags,
  suggestedTags = [],
  isAdmin,
}: {
  titleId: number;
  /**
   * The title's tags: the saved ones, merged with the genres both sites give
   * it right now (see mergeTags).
   */
  tags: Tag[];
  /**
   * Which of `tags` are saved on the title. Edit mode lists only these: a
   * genre shown only because a site gives it live has no saved link to
   * remove. Omitted means every tag is saved.
   */
  savedTagIds?: ReadonlySet<number>;
  /**
   * Genres MyAnimeList or AniList give this title. Shown in edit mode but
   * never removable — the server refuses it too (see untagTitle).
   */
  lockedTagIds?: ReadonlySet<number>;
  /** Every active tag, for the "add a tag" / "suggest a tag" picker. */
  allTags: Tag[];
  /** The viewer's own pending suggestions for this title. */
  suggestedTags?: Tag[];
  isAdmin: boolean;
}) {
  // Hooks run before the early return: a component may not call fewer hooks on
  // one render than another. The reader's "nothing to show" case is decided
  // after, not by skipping useState.
  const [editing, setEditing] = useState(false);

  // The format (Manhwa, Novel, …) is left out: the header shows it as its own
  // badge, linking to the same tag page, so a chip here would say it twice.
  const shown = tags.filter(
    (tag) =>
      tag.kind !== "format" &&
      (!editing || !isAdmin || !savedTagIds || savedTagIds.has(tag.id)),
  );

  const pending = isAdmin ? [] : suggestedTags;

  if (
    shown.length === 0 &&
    pending.length === 0 &&
    allTags.length === 0 &&
    !isAdmin
  ) {
    return null;
  }

  const taggedIds = new Set([...tags, ...pending].map((tag) => tag.id));
  const untagged = allTags.filter(
    (tag) => !taggedIds.has(tag.id) && tag.kind !== "format",
  );

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {shown.length > 0 || pending.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {shown.map((tag) => (
              <li key={tag.id}>
                {editing && isAdmin && !lockedTagIds?.has(tag.id) ? (
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
            {pending.map((tag) => (
              <li key={tag.id}>
                <Badge
                  variant="outline"
                  title="Suggested — waiting for an admin"
                  className="border-dashed text-muted-foreground"
                >
                  {tag.name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {/* aria-pressed rather than a label that says "on": this is a
            toggle, and that is the attribute a screen reader already knows
            how to announce. */}
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
          ) : isAdmin ? (
            <Pencil className="size-3.5" />
          ) : (
            <Lightbulb className="size-3.5" />
          )}
          {editing ? "Done" : isAdmin ? "Edit" : "Suggest"}
        </Button>
      </div>

      {editing ? (
        <AddTagPicker
          titleId={titleId}
          options={untagged}
          action={isAdmin ? tagTitle : suggestTag}
          verb={isAdmin ? "Tag" : "Suggest"}
          label={isAdmin ? "Add a tag" : "Suggest a tag"}
        />
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
 * The "add a tag" control: a native select plus a submit button. The admin's
 * tags the title outright; a reader's files a suggestion.
 *
 * A native <select>, not the Radix one, for the same reason TagForm's kind
 * field is native: it is already a form control that lands in FormData on its
 * own, and this control's whole job is to produce FormData for its action.
 *
 * Nothing to pick from (every active tag is already applied, or none exist)
 * collapses to a quiet hint rather than a disabled control with nothing to say.
 */
function AddTagPicker({
  titleId,
  options,
  action: submit,
  verb,
  label,
}: {
  titleId: number;
  options: Tag[];
  action: (prev: TagState, formData: FormData) => Promise<TagState>;
  verb: string;
  label: string;
}) {
  const router = useRouter();

  const [state, action, pending] = useActionState<TagState, FormData>(
    submit,
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
        aria-label={label}
        defaultValue=""
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="" disabled>
          {label}…
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
        {verb}
      </Button>
    </form>
  );
}
