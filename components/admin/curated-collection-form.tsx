"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  createCuratedCollection,
  updateCuratedCollection,
  type AdminCollectionState,
} from "@/app/actions/admin-collections";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminCollectionSummary } from "@/lib/data/admin";

/**
 * The one form behind both "new curated collection" and "edit".
 *
 * Which action runs is decided by whether a collection was handed in, the same
 * shape TagForm uses. The two differ in one place worth naming: `slug` is
 * offered on create and only displayed on edit, because
 * updateCuratedCollection deliberately never changes it — it is in
 * /discover/collection/<slug> URLs, and renaming the shelf must not silently
 * break every link to it.
 */
export function CuratedCollectionForm({
  collection,
  /**
   * Called after a create or a save settles, so the list can close its
   * dialog. On create, `collectionId` carries the new shelf's id — the list
   * uses it to navigate straight there instead of just closing.
   */
  onDone,
}: {
  collection?: AdminCollectionSummary;
  onDone?: (collectionId?: number) => void;
}) {
  const router = useRouter();
  const editing = collection !== undefined;

  const [state, action] = useActionState<AdminCollectionState, FormData>(
    editing ? updateCuratedCollection : createCuratedCollection,
    null,
  );

  // useActionState keeps its result for the life of the component, so an
  // unguarded effect re-fires on every render that follows — and because it
  // refreshes, that would be a loop rather than a stray toast.
  const handled = useRef<AdminCollectionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) return; // rendered inline, below the fields
    toast.success(state.message ?? "Saved.");
    router.refresh();
    onDone?.(state.collectionId);
  }, [state, router, onDone]);

  const id = editing ? `curated-${collection.id}` : "curated-new";

  return (
    <form action={action} className="grid gap-4">
      {editing ? <input type="hidden" name="id" value={collection.id} /> : null}

      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          name="name"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Staff picks"
          defaultValue={collection?.name ?? ""}
        />
      </div>

      {editing ? (
        <p className="text-xs text-muted-foreground">
          URL: /discover/collection/{collection.slug}
        </p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-slug`}>
            Slug <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`${id}-slug`}
            name="slug"
            maxLength={80}
            autoComplete="off"
            placeholder="Taken from the name if left blank"
          />
          {/* Worth saying once, here: this is the only moment the slug can be
              chosen. The edit form has no field for it. */}
          <p className="text-xs text-muted-foreground">
            This goes in the URL and can&rsquo;t be changed afterwards.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`${id}-description`}>
          Description <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id={`${id}-description`}
          name="description"
          maxLength={200}
          autoComplete="off"
          placeholder="What we're reading this month."
          defaultValue={collection?.description ?? ""}
        />
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          {/* updateCuratedCollection reads is_active as `=== "on"`, which is
              exactly what an unchecked box sends: nothing. So an absent field
              retires the shelf, and this needs no hidden partner. */}
          <input
            id={`${id}-active`}
            type="checkbox"
            name="is_active"
            defaultChecked={collection.isActive}
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

      <SubmitButton>{editing ? "Save" : "Create collection"}</SubmitButton>
    </form>
  );
}
