"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { createTag, updateTag, type TagState } from "@/app/actions/tags";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TAG_KINDS, type Tag } from "@/lib/data/tag-items";

/**
 * The one form behind both "new tag" and "edit tag".
 *
 * Which action runs is decided by whether a tag was handed in, not by a mode
 * flag: the two actions take almost the same fields, and the only real
 * difference — the id, and the retire checkbox that only means anything on a
 * row that exists — falls out of that same condition.
 *
 * `kind` is a native <select> rather than the Radix one. Radix's select keeps
 * its value in React state and renders a button, so it needs a hidden input to
 * reach FormData at all; a native select is already a form control, and this
 * form's whole job is to produce FormData.
 *
 * The kind defaults to `trope` for a new tag and to the tag's own kind when
 * editing. That asymmetry is the point: `genre` is what the MAL import writes,
 * and an imported genre must not quietly become a trope because somebody came
 * here to fix its description.
 */
export function TagForm({
  tag,
  /** Called after a create or a save settles, so the list can close its dialog. */
  onDone,
}: {
  tag?: Tag;
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = tag !== undefined;

  // Two hooks would be wrong here: only one of these can ever run for a given
  // mount, because `editing` is fixed by the props. One hook bound to the
  // right action keeps a single result to report.
  const [state, action] = useActionState<TagState, FormData>(
    editing ? updateTag : createTag,
    null,
  );

  // useActionState keeps its result for the life of the component, so an
  // unguarded effect re-fires on every render that follows — and because it
  // refreshes, that would be a loop rather than a stray toast.
  const handled = useRef<TagState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) return; // rendered inline, below the fields
    toast.success(state.message ?? "Saved.");
    router.refresh();
    onDone?.();
  }, [state, router, onDone]);

  const id = editing ? `tag-${tag.id}` : "tag-new";

  return (
    <form action={action} className="grid gap-4">
      {editing ? <input type="hidden" name="id" value={tag.id} /> : null}

      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          name="name"
          required
          maxLength={60}
          autoComplete="off"
          placeholder="Isekai"
          defaultValue={tag?.name ?? ""}
        />
        {editing ? (
          // The slug is not editable — updateTag deliberately never recomputes
          // it, because it is in /discover/tag/<slug> URLs. Showing it makes
          // that visible rather than surprising.
          <p className="text-xs text-muted-foreground">
            URL: /discover/tag/{tag.slug}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-kind`}>Kind</Label>
        <select
          id={`${id}-kind`}
          name="kind"
          defaultValue={tag?.kind ?? "trope"}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {TAG_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-description`}>
          Description <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id={`${id}-description`}
          name="description"
          maxLength={200}
          autoComplete="off"
          placeholder="Dropped into another world."
          defaultValue={tag?.description ?? ""}
        />
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          {/* updateTag reads is_active as `=== "on"`, which is exactly what an
              unchecked box sends: nothing. So an absent field retires the tag,
              and this checkbox needs no hidden partner. */}
          <input
            id={`${id}-active`}
            type="checkbox"
            name="is_active"
            defaultChecked={tag.is_active}
            className="size-4 rounded border-input accent-brand"
          />
          <Label htmlFor={`${id}-active`} className="font-normal">
            Shown on Discover
          </Label>
        </div>
      ) : null}

      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton>{editing ? "Save" : "Create tag"}</SubmitButton>
    </form>
  );
}
