"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteCollection,
  updateCollection,
  type CollectionState,
} from "@/app/actions/collections";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The name and description of one of the viewer's own collections, with the
 * two things that can be done to the collection itself.
 *
 * Deleting is confirmed rather than immediate. It cascades to every item, and
 * the notes and ordering on them are hand-made — this is the same
 * unrecoverable-by-resync data the TODO(confirm-destructive) note is about.
 * The titles are untouched: a collection holds catalog references, so deleting
 * one never takes anything out of the library.
 */
export function CollectionHeader({
  collection,
  itemCount,
}: {
  collection: { id: number; name: string; description: string | null };
  itemCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [state, action] = useActionState<CollectionState, FormData>(
    async (prev, formData) => {
      const result = await updateCollection(prev, formData);
      if (result?.message) setEditing(false);
      return result;
    },
    null,
  );

  const [deleteState, deleteAction, deleting] = useActionState<
    CollectionState,
    FormData
  >(deleteCollection, null);

  // Navigating away has to wait for the delete to land, and the action's
  // state persists once it has — so this fires once rather than on every
  // render that follows.
  const handled = useRef(false);

  useEffect(() => {
    if (!deleteState || handled.current) return;
    if (deleteState.error) {
      toast.error(deleteState.error);
      return;
    }
    handled.current = true;
    toast.success(deleteState.message ?? "Collection deleted.");
    router.push("/collections");
  }, [deleteState, router]);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid min-w-0 gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {collection.name}
        </h1>
        {collection.description ? (
          <p className="text-sm text-muted-foreground">
            {collection.description}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {itemCount} {itemCount === 1 ? "title" : "titles"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-pill"
          onClick={() => setEditing(true)}
          aria-label={`Rename ${collection.name}`}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-pill text-muted-foreground hover:text-alert"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${collection.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit collection</DialogTitle>
          </DialogHeader>

          <form action={action} className="grid gap-4">
            <input type="hidden" name="id" value={collection.id} />

            <div className="grid gap-2">
              <Label htmlFor="edit-collection-name">Name</Label>
              <Input
                id="edit-collection-name"
                name="name"
                required
                maxLength={80}
                autoComplete="off"
                defaultValue={collection.name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-collection-description">
                Description{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="edit-collection-description"
                name="description"
                maxLength={200}
                autoComplete="off"
                defaultValue={collection.description ?? ""}
              />
            </div>

            {state?.error ? (
              <p role="alert" className="text-sm text-alert">
                {state.error}
              </p>
            ) : null}

            <DialogFooter>
              <SubmitButton>Save</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{collection.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {itemCount === 0
                ? "This collection is empty, so nothing goes with it."
                : `The ${itemCount} ${itemCount === 1 ? "title stays" : "titles stay"} in your library — only the grouping is deleted, and it can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            {/* asChild so the confirm button submits the form rather than
                just closing the dialog. */}
            <AlertDialogAction asChild>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={collection.id} />
                <button type="submit" disabled={deleting} className="w-full">
                  Delete
                </button>
              </form>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
