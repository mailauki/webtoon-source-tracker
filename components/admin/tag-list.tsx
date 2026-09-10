"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTag, type TagState } from "@/app/actions/tags";
import { TagForm } from "@/components/admin/tag-form";
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
import { groupByKind, type Tag } from "@/lib/data/tag-items";

export type AdminTag = Tag & { titleCount: number };

/**
 * Every tag, grouped by kind, with the three things that can be done to one.
 *
 * Retired tags are shown rather than filtered — this is the only surface that
 * shows them, so filtering here would leave no way to bring one back. They are
 * marked instead, which is what `is_active` means: withdrawn from Discover,
 * not gone.
 *
 * Retiring is the edit form's checkbox rather than its own button. Deleting is
 * separate and confirmed, because for a MAL-imported tag it is not even
 * permanent — the next sync re-creates the row, having found nothing to skip.
 */
export function TagList({ tags }: { tags: AdminTag[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminTag | null>(null);
  const [deleting, setDeleting] = useState<AdminTag | null>(null);

  const groups = groupByKind(tags) as { kind: string; tags: AdminTag[] }[];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Tags
          </h1>
          <p className="text-sm text-muted-foreground">
            {tags.length === 0
              ? "No tags yet."
              : `${tags.length} ${tags.length === 1 ? "tag" : "tags"}, retired ones included.`}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-4" />
          New tag
        </Button>
      </div>

      {tags.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Tags are the vocabulary behind Discover. Genres arrive with a
          MyAnimeList sync; tropes, themes and formats are written here.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.kind} className="grid gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {group.kind}
            </h2>
            <ul className="grid gap-1">
              {group.tags.map((tag) => (
                <li
                  key={tag.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <Link
                    href={`/admin/tags/${tag.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
                  >
                    {tag.name}
                  </Link>

                  {tag.mal_genre_id !== null ? (
                    <Badge variant="outline" className="shrink-0">
                      MAL
                    </Badge>
                  ) : null}
                  {tag.is_active ? null : (
                    <Badge variant="outline" className="shrink-0">
                      Retired
                    </Badge>
                  )}

                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {tag.titleCount}{" "}
                    {tag.titleCount === 1 ? "title" : "titles"}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-pill"
                    onClick={() => setEditing(tag)}
                    aria-label={`Edit ${tag.name}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-pill text-muted-foreground hover:text-alert"
                    onClick={() => setDeleting(tag)}
                    aria-label={`Delete ${tag.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New tag</DialogTitle>
            <DialogDescription>
              A trope, theme or format readers can browse Discover by.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each new tag starts from a blank form
              and a blank action state rather than the last one's result. */}
          {creating ? <TagForm onCreated={() => setCreating(false)} /> : null}
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
            <DialogTitle>Edit tag</DialogTitle>
          </DialogHeader>
          {/* Keyed on the tag: opening the dialog for a second tag remounts
              the form with that tag's values and a fresh action state, rather
              than showing the first tag's defaults and its stale result. */}
          {editing ? <TagForm key={editing.id} tag={editing} /> : null}
        </DialogContent>
      </Dialog>

      <DeleteTagDialog tag={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

/**
 * "Delete this tag?", for whichever tag is currently up for deletion.
 *
 * The dialog stays mounted across rows while its inner form is keyed on the
 * tag id. Without that split the form's useActionState would carry the first
 * delete's success into the next dialog, whose effect would then fire on a
 * row nobody has confirmed — the bug DeleteCollectionDialog was split to fix.
 */
function DeleteTagDialog({
  tag,
  onClose,
}: {
  tag: AdminTag | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={tag !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        {tag ? (
          <DeleteTagBody key={tag.id} tag={tag} onDone={onClose} />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteTagBody({
  tag,
  onDone,
}: {
  tag: AdminTag;
  onDone: () => void;
}) {
  const router = useRouter();

  const [state, action, pending] = useActionState<TagState, FormData>(
    deleteTag,
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
    toast.success(state.message ?? "Tag deleted.");
    onDone();
    router.refresh();
  }, [state, onDone, router]);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete “{tag.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {tag.titleCount === 0
            ? "Nothing carries this tag, so nothing goes with it."
            : `It comes off ${tag.titleCount} ${tag.titleCount === 1 ? "title" : "titles"} — the titles themselves stay in the catalog.`}
          {tag.mal_genre_id !== null
            ? " This one came from MyAnimeList, so the next sync will re-create it. Retire it instead to keep it off Discover for good."
            : ""}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep it</AlertDialogCancel>
        {/* Not wrapped in AlertDialogAction: that closes the dialog on click,
            which would unmount this form mid-submit. Closing is the effect's
            job, once the delete has actually landed. */}
        <form action={action}>
          <input type="hidden" name="id" value={tag.id} />
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
