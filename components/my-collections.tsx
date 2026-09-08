"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteCollection,
  type CollectionState,
} from "@/app/actions/collections";
import { CollectionForm } from "@/components/collection-form";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Collection } from "@/lib/data/collection-items";

/**
 * The viewer's own collections, as a list of rows.
 *
 * A list rather than the shelves /discover uses. A curated shelf is a browsing
 * surface, where the covers are the content; this is a management surface —
 * the questions are "what have I made" and "what is in it", and the answers
 * are names and counts. The covers live one level down, on the collection's
 * own page.
 */
export function MyCollections({ collections }: { collections: Collection[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Your collections
          </h1>
          <p className="text-sm text-muted-foreground">
            Group titles however you like — they stay private to you.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          className="shrink-0 rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-4" />
          <span className="max-sm:sr-only">New collection</span>
        </Button>
      </div>

      {collections.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <Layers className="size-8 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold">No collections yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            A collection is any grouping that makes sense to you — comfort
            rereads, titles to recommend, the ones you keep meaning to finish.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {collections.map((collection) => (
            <li
              key={collection.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              <Link
                href={`/collections/mine/${collection.id}`}
                className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="truncate font-medium">{collection.name}</p>
                {collection.description ? (
                  <p className="truncate text-sm text-muted-foreground">
                    {collection.description}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {collection.items.length}{" "}
                  {collection.items.length === 1 ? "title" : "titles"}
                </p>
              </Link>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-pill"
                  onClick={() => setEditing(collection)}
                  aria-label={`Rename ${collection.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-pill text-muted-foreground"
                  onClick={() => setPendingDelete(collection)}
                  aria-label={`Delete ${collection.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              Name it now; add titles from your library afterwards.
            </DialogDescription>
          </DialogHeader>
          {/* Keyed so a cancelled form does not reopen with the last attempt's
              text still in the fields. */}
          {creating ? (
            <CollectionForm key="create" onDone={() => setCreating(false)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename collection</DialogTitle>
            <DialogDescription>
              Changing the name does not affect what is in it.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <CollectionForm
              key={editing.id}
              collection={editing}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteCollectionDialog
        collection={pendingDelete}
        onDone={() => setPendingDelete(null)}
      />
    </div>
  );
}

/**
 * Confirmation before deleting a collection.
 *
 * Deleting cascades to its items, and unlike a custom source there is nothing
 * here a re-sync could not rebuild — the collection holds references, not the
 * hand-entered URLs and notes that make TODO(confirm-destructive) matter. It
 * still confirms, because the grouping itself is hand-made and the button sits
 * one tap from the row it deletes.
 *
 * The dialog stays mounted so it can animate closed; the form inside is keyed
 * on the collection and mounts only while one is pending. That split matters:
 * useActionState keeps its result for the life of the component, so a single
 * long-lived form would still be holding the previous delete's success when
 * the next one opened — and would fire its effect immediately, on a
 * collection nobody had confirmed yet.
 */
function DeleteCollectionDialog({
  collection,
  onDone,
}: {
  collection: Collection | null;
  onDone: () => void;
}) {
  return (
    <AlertDialog
      open={collection !== null}
      onOpenChange={(open) => !open && onDone()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{collection?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The collection and its ordering go with it. The titles themselves
            stay in your library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {collection ? (
          <DeleteCollectionForm
            key={collection.id}
            collection={collection}
            onDone={onDone}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteCollectionForm({
  collection,
  onDone,
}: {
  collection: Collection;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState<CollectionState, FormData>(
    deleteCollection,
    null,
  );
  const handled = useRef(false);

  useEffect(() => {
    if (!state || handled.current) return;
    handled.current = true;

    if (state.ok) {
      toast.success(state.message);
      router.refresh();
    } else {
      toast.error(state.error);
    }
    onDone();
  }, [state, onDone, router]);

  return (
    <AlertDialogFooter>
      <AlertDialogCancel className="rounded-pill">Cancel</AlertDialogCancel>
      <form action={action}>
        <input type="hidden" name="id" value={collection.id} />
        <AlertDialogAction type="submit" className="rounded-pill">
          Delete
        </AlertDialogAction>
      </form>
    </AlertDialogFooter>
  );
}
