"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import {
  createCollection,
  type CollectionState,
} from "@/app/actions/collections";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "New collection" — the button and the dialog behind it.
 *
 * On success it navigates to the new collection rather than closing back to
 * the index: a collection is made in order to put something in it, and the
 * only place to do that is its own page.
 */
export function NewCollection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [state, action] = useActionState<CollectionState, FormData>(
    createCollection,
    null,
  );

  // The action's successful state persists for the life of the component, so
  // this navigates once rather than on every subsequent render.
  const handled = useRef(false);

  useEffect(() => {
    if (!state?.collectionId || handled.current) return;
    handled.current = true;
    setOpen(false);
    router.push(`/collections/${state.collectionId}`);
  }, [state, router]);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
      >
        <Plus className="size-4" />
        New collection
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              Group titles however you like — comfort rereads, recommendations
              for a friend, whatever you want to keep together.
            </DialogDescription>
          </DialogHeader>

          <form action={action} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-collection-name">Name</Label>
              <Input
                id="new-collection-name"
                name="name"
                required
                maxLength={80}
                autoComplete="off"
                placeholder="Comfort rereads"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-collection-description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="new-collection-description"
                name="description"
                maxLength={200}
                autoComplete="off"
                placeholder="The ones I go back to."
              />
            </div>

            {state?.error ? (
              <p role="alert" className="text-sm text-alert">
                {state.error}
              </p>
            ) : null}

            <DialogFooter>
              <SubmitButton>Create</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
