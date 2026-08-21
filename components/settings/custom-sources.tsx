"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import {
  createCustomSource,
  deleteCustomSource,
  renameCustomSource,
  type CustomSourceState,
} from "@/app/actions/custom-sources";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Source } from "@/lib/data/sources";

export function CustomSources({ sources }: { sources: Source[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [state, action] = useActionState<CustomSourceState, FormData>(
    async (prev, formData) => {
      const result = await createCustomSource(prev, formData);
      if (result?.message) setAdding(false);
      return result;
    },
    null,
  );
  const [deleteState, deleteAction] = useActionState(deleteCustomSource, null);

  return (
    <div className="grid gap-3">
      {sources.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          No custom sources yet. Add one for a site that isn&apos;t in the
          catalog — it stays private to you.
        </p>
      ) : null}

      <ul className="grid gap-2">
        {sources.map((source) =>
          editingId === source.id ? (
            <li key={source.id}>
              <RenameForm source={source} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li
              key={source.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{source.name}</p>
                {source.base_url ? (
                  <p className="truncate text-sm text-muted-foreground">
                    {source.base_url}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-pill"
                  onClick={() => setEditingId(source.id)}
                  aria-label={`Rename ${source.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={source.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="rounded-pill text-muted-foreground hover:text-alert"
                    aria-label={`Delete ${source.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              </div>
            </li>
          ),
        )}
      </ul>

      {deleteState?.error ? (
        <p role="alert" className="text-sm text-alert">
          {deleteState.error}
        </p>
      ) : null}

      {adding ? (
        <form
          action={action}
          className="grid gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="new-source-name">Name</Label>
            <Input
              id="new-source-name"
              name="name"
              placeholder="e.g. Asura Scans"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-source-url">Site (optional)</Label>
            <Input
              id="new-source-url"
              name="base_url"
              type="url"
              placeholder="https://…"
            />
          </div>
          {state?.error ? (
            <p role="alert" className="text-sm text-alert">
              {state.error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <SubmitButton className="rounded-pill bg-brand px-6 font-bold text-brand-foreground hover:bg-brand/90">
              Add source
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              className="rounded-pill"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-pill"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" />
            Add custom source
          </Button>
        </div>
      )}
    </div>
  );
}

function RenameForm({
  source,
  onDone,
}: {
  source: Source;
  onDone: () => void;
}) {
  const [state, action] = useActionState<CustomSourceState, FormData>(
    async (prev, formData) => {
      const result = await renameCustomSource(prev, formData);
      if (result?.message) onDone();
      return result;
    },
    null,
  );

  return (
    <form
      action={action}
      className="grid gap-2 rounded-lg border border-border bg-card p-4"
    >
      <input type="hidden" name="id" value={source.id} />
      <div className="flex items-center gap-2">
        <Input name="name" defaultValue={source.name} required autoFocus />
        <SubmitButton className="rounded-pill px-4">Save</SubmitButton>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-pill"
          onClick={onDone}
          aria-label="Cancel"
        >
          <X className="size-4" />
        </Button>
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
