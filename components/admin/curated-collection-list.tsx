"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteCuratedCollection,
  type AdminCollectionState,
} from "@/app/actions/admin-collections";
import { CuratedCollectionForm } from "@/components/admin/curated-collection-form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminCollectionSummary } from "@/lib/data/admin";

/**
 * Every curated collection, retired ones included, with create/edit/retire.
 *
 * Retired shelves are shown rather than filtered — this is the only surface
 * that shows them, so filtering here would leave no way to bring one back.
 * They are marked instead, which is what `is_active` means: withdrawn from
 * /discover, not gone.
 *
 * Retiring is the edit form's checkbox. Deleting is separate and confirmed,
 * because it cascades to the items and their hand-made ordering — the same
 * unrecoverable-by-resync data CollectionHeader confirms for.
 */
export function CuratedCollectionList({
  collections,
}: {
  collections: AdminCollectionSummary[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminCollectionSummary | null>(null);
  const [deleting, setDeleting] = useState<AdminCollectionSummary | null>(null);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Curated collections
          </h1>
          <p className="text-sm text-muted-foreground">
            {collections.length === 0
              ? "No curated collections yet."
              : `${collections.length} ${collections.length === 1 ? "shelf" : "shelves"}, retired ones included.`}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-4" />
          New collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          A curated collection is an editorial shelf on Discover — the same
          table as a reader&rsquo;s own collections, kept apart by having no
          owner.
        </p>
      ) : (
        <ul className="grid gap-1">
          {collections.map((collection) => (
            <li
              key={collection.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div className="grid min-w-0 flex-1 gap-0.5">
                <Link
                  href={`/admin/collections/${collection.id}`}
                  className="truncate text-sm font-semibold hover:underline"
                >
                  {collection.name}
                </Link>
                <span className="truncate text-xs text-muted-foreground">
                  /{collection.slug}
                </span>
              </div>

              {collection.isActive ? null : (
                <Badge variant="outline" className="shrink-0">
                  Retired
                </Badge>
              )}

              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {collection.itemCount}{" "}
                {collection.itemCount === 1 ? "title" : "titles"}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-pill"
                onClick={() => setEditing(collection)}
                aria-label={`Edit ${collection.name}`}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-pill text-muted-foreground hover:text-alert"
                onClick={() => setDeleting(collection)}
                aria-label={`Delete ${collection.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New curated collection</DialogTitle>
            <DialogDescription>
              An editorial shelf on Discover. Its slug goes in the URL and
              can&rsquo;t be changed afterwards.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each new collection starts from a
              blank form and a blank action state. On success this navigates
              to the new shelf rather than closing back to the list — a
              collection is made in order to put something in it, and the only
              place to do that is its own page. */}
          {creating ? (
            <CuratedCollectionForm
              onDone={(collectionId) => {
                setCreating(false);
                // createCuratedCollection always returns a collectionId on
                // success; the guard is only for the type, which has to allow
                // the edit form calling the same prop with none.
                if (collectionId !== undefined) {
                  router.push(`/admin/collections/${collectionId}`);
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit collection</DialogTitle>
          </DialogHeader>
          {/* Keyed on the collection: opening the dialog for a second shelf
              remounts the form with that shelf's values and a fresh action
              state, rather than the first one's defaults and stale result. */}
          {editing ? (
            <CuratedCollectionForm
              key={editing.id}
              collection={editing}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteCollectionDialog
        collection={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

/**
 * "Delete this collection?", for whichever shelf is currently up for deletion.
 *
 * The dialog stays mounted across rows while its inner form is keyed on the
 * collection id. Without that split the form's useActionState would carry the
 * first delete's success into the next dialog, whose effect would then fire on
 * a row nobody has confirmed — only the first delete would toast, and the
 * second would toast for a shelf still sitting there.
 */
function DeleteCollectionDialog({
  collection,
  onClose,
}: {
  collection: AdminCollectionSummary | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={collection !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        {collection ? (
          <DeleteCollectionBody
            key={collection.id}
            collection={collection}
            onDone={onClose}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteCollectionBody({
  collection,
  onDone,
}: {
  collection: AdminCollectionSummary;
  onDone: () => void;
}) {
  const router = useRouter();

  const [state, action, pending] = useActionState<
    AdminCollectionState,
    FormData
  >(deleteCuratedCollection, null);

  const handled = useRef<AdminCollectionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) {
      toast.error(state.error);
      return;
    }
    toast.success(state.message ?? "Collection deleted.");
    onDone();
    router.refresh();
  }, [state, onDone, router]);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete “{collection.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {collection.itemCount === 0
            ? "This shelf is empty, so nothing goes with it."
            : `Its ${collection.itemCount} ${collection.itemCount === 1 ? "title stays" : "titles stay"} in the catalog — the shelf and its ordering are what go, and that can't be undone.`}{" "}
          Retire it instead to take it off Discover and keep it.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep it</AlertDialogCancel>
        {/* Not wrapped in AlertDialogAction: that closes the dialog on click,
            which would unmount this form mid-submit. Closing is the effect's
            job, once the delete has actually landed. */}
        <form action={action}>
          <input type="hidden" name="id" value={collection.id} />
          <Button
            type="submit"
            disabled={pending}
            className="w-full rounded-pill bg-alert font-bold text-alert-foreground hover:bg-alert/90"
          >
            Delete
          </Button>
        </form>
      </AlertDialogFooter>
    </>
  );
}
