"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  addEntrySource,
  removeEntrySource,
  updateEntrySource,
  type EntrySourceState,
} from "@/app/actions/entry-sources";
import { SubmitButton } from "@/components/auth/submit-button";
import { SourceFields, type EntrySource } from "@/components/source-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Source } from "@/lib/data/rank-sources";

/**
 * Attach or edit one source without leaving the library.
 *
 * Rendered as a sibling of the context menu rather than inside it: Radix
 * unmounts menu content on close, which would tear the dialog down with it.
 */
export function EntrySourceDialog({
  entryId,
  entryTitle,
  request,
  attached,
  catalog,
  onClose,
}: {
  entryId: number;
  entryTitle: string;
  request: { mode: "add" } | { mode: "edit"; entrySourceId: number } | null;
  attached: EntrySource[];
  catalog: Source[];
  onClose: () => void;
}) {
  const editing =
    request?.mode === "edit"
      ? (attached.find((s) => s.id === request.entrySourceId) ?? null)
      : null;

  const [state, action] = useActionState<EntrySourceState, FormData>(
    async (prev, formData) => {
      const result = editing
        ? await updateEntrySource(prev, formData)
        : await addEntrySource(prev, formData);

      if (result?.error) toast.error(result.error);
      if (result?.message) {
        toast.success(result.message);
        onClose();
      }
      return result;
    },
    null,
  );

  // Only sources not already on this entry can be added; the unique index on
  // (entry_id, source_id) would reject the rest anyway.
  const attachedIds = new Set(attached.map((s) => s.sources?.id));
  const available = catalog.filter((c) => !attachedIds.has(c.id));

  if (!request) return null;

  // An edit request whose row vanished (removed in another tab) has nothing to
  // show; failing closed beats rendering an empty form bound to a stale id.
  if (request.mode === "edit" && !editing) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `Edit ${editing.sources?.name ?? "source"}`
              : "Add a source"}
          </DialogTitle>
          <DialogDescription>{entryTitle}</DialogDescription>
        </DialogHeader>

        <form action={action} className="grid gap-3">
          <input type="hidden" name="entry_id" value={entryId} />
          {editing ? (
            <input type="hidden" name="id" value={editing.id} />
          ) : null}

          {editing ? null : (
            <div className="grid gap-2">
              <Label htmlFor="dialog-source">Source</Label>
              <select
                id="dialog-source"
                name="source_id"
                required
                defaultValue=""
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">Choose a source…</option>
                <optgroup label="Catalog">
                  {available
                    .filter((s) => s.owner_id === null)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
                {available.some((s) => s.owner_id !== null) ? (
                  <optgroup label="Your sources">
                    {available
                      .filter((s) => s.owner_id !== null)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
          )}

          <SourceFields source={editing ?? undefined} />

          {state?.error ? (
            <p role="alert" className="text-sm text-alert">
              {state.error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <RemoveButton
                entryId={entryId}
                entrySourceId={editing.id}
                onDone={onClose}
              />
            ) : (
              <span />
            )}
            <SubmitButton className="rounded-pill bg-brand px-6 font-bold text-brand-foreground hover:bg-brand/90">
              {editing ? "Save" : "Add"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Detaching is destructive, so it asks once before going through. */
function RemoveButton({
  entryId,
  entrySourceId,
  onDone,
}: {
  entryId: number;
  entrySourceId: number;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const [, action] = useActionState<EntrySourceState, FormData>(
    async (prev, formData) => {
      const result = await removeEntrySource(prev, formData);
      if (result?.error) toast.error(result.error);
      if (result?.message) {
        toast.success(result.message);
        onDone();
      }
      return result;
    },
    null,
  );

  // A stray confirm state should not persist if the user backs out and returns.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-alert hover:text-alert"
        onClick={() => setConfirming(true)}
      >
        Remove
      </Button>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="id" value={entrySourceId} />
      <SubmitButton className="rounded-pill px-4 text-alert hover:bg-alert/10 hover:text-alert">
        Really remove?
      </SubmitButton>
    </form>
  );
}
