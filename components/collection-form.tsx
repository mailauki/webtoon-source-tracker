"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createCollection,
  updateCollection,
  type CollectionState,
} from "@/app/actions/collections";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Collection } from "@/lib/data/collection-items";

/**
 * Create or rename one of the viewer's own collections.
 *
 * One component for both, because the fields are identical and the only
 * difference is which action runs and whether an id rides along. Splitting
 * them would duplicate the validation copy and the two would drift.
 *
 * `onDone` closes whatever opened this. It fires only on success — a rejected
 * name has to stay on screen with its error, or the user loses what they typed.
 */
export function CollectionForm({
  collection,
  onDone,
}: {
  collection?: Pick<Collection, "id" | "name" | "description">;
  onDone?: () => void;
}) {
  const editing = collection !== undefined;
  const router = useRouter();

  const [state, action] = useActionState<CollectionState, FormData>(
    editing ? updateCollection : createCollection,
    null,
  );

  // Same guard as the collection card's: `state` keeps its successful value
  // for the life of the component, so without it this re-fires on every
  // render that follows — and it calls router.refresh(), which causes one.
  const handled = useRef(false);

  useEffect(() => {
    if (!state?.ok || handled.current) return;
    handled.current = true;
    toast.success(state.message);
    onDone?.();
    router.refresh();
  }, [state, onDone, router]);

  return (
    <form action={action} className="grid gap-3">
      {editing ? <input type="hidden" name="id" value={collection.id} /> : null}

      <div className="grid gap-1.5">
        <Label htmlFor="collection-name">Name</Label>
        <Input
          id="collection-name"
          name="name"
          defaultValue={collection?.name ?? ""}
          placeholder="Comfort rereads"
          maxLength={80}
          required
          autoFocus
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="collection-description">
          Description <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="collection-description"
          name="description"
          defaultValue={collection?.description ?? ""}
          placeholder="The ones I go back to when nothing else lands."
          maxLength={200}
        />
      </div>

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {onDone ? (
          <Button
            type="button"
            variant="ghost"
            className="rounded-pill"
            onClick={onDone}
          >
            Cancel
          </Button>
        ) : null}
        <SubmitButton className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90">
          {editing ? "Save" : "Create collection"}
        </SubmitButton>
      </div>
    </form>
  );
}
