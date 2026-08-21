"use client";

import { useActionState, useState } from "react";
import { Crown, Lock, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  addEntrySource,
  removeEntrySource,
  updateEntrySource,
  type EntrySourceState,
} from "@/app/actions/entry-sources";
import { createCustomSource } from "@/app/actions/custom-sources";
import { SubmitButton } from "@/components/auth/submit-button";
import { SourceFields, type EntrySource } from "@/components/source-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Source } from "@/lib/data/rank-sources";

export function EntrySourceEditor({
  entryId,
  sources,
  catalog,
}: {
  entryId: number;
  sources: EntrySource[];
  catalog: Source[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const attachedIds = new Set(sources.map((s) => s.sources?.id));
  const available = catalog.filter((c) => !attachedIds.has(c.id));

  return (
    // Anchor kept so /entry/[id]#sources lands on this section.
    <section id="sources" className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">
            Where I read it
          </h2>
          <p className="text-sm text-muted-foreground">
            {sources.length === 0
              ? "No source recorded yet."
              : `${sources.length} ${sources.length === 1 ? "source" : "sources"}`}
          </p>
        </div>
        {!adding && available.length > 0 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setAdding(true)}
            className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="size-4" />
            Add source
          </Button>
        ) : null}
      </div>

      {adding ? (
        <AddSourceForm
          entryId={entryId}
          available={available}
          onDone={() => setAdding(false)}
        />
      ) : null}

      {sources.length === 0 && !adding ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Record where you read this — the app, the site, or a physical copy.
        </p>
      ) : null}

      <ul className="grid gap-2">
        {sources.map((source) =>
          editingId === source.id ? (
            <li key={source.id}>
              <EditSourceForm
                entryId={entryId}
                source={source}
                onDone={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={source.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{source.sources?.name}</span>
                  {source.is_primary ? (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand-foreground dark:text-brand">
                      <Crown className="size-3" /> Primary
                    </span>
                  ) : null}
                  {source.is_paid ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Lock className="size-3" /> Paid
                    </span>
                  ) : null}
                  {source.is_official === false ? (
                    <span className="text-[11px] text-muted-foreground">
                      Unofficial
                    </span>
                  ) : null}
                </div>

                {source.chapters_read !== null ? (
                  <p className="text-sm text-muted-foreground">
                    Up to chapter {source.chapters_read} here
                  </p>
                ) : null}

                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="truncate text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {source.url}
                  </a>
                ) : null}

                {source.notes ? (
                  <p className="text-sm text-muted-foreground">
                    {source.notes}
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
                  aria-label={`Edit ${source.sources?.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <RemoveButton entryId={entryId} sourceRowId={source.id} />
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function AddSourceForm({
  entryId,
  available,
  onDone,
}: {
  entryId: number;
  available: Source[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<EntrySourceState, FormData>(
    async (prev, formData) => {
      const result = await addEntrySource(prev, formData);
      if (result?.message) onDone();
      return result;
    },
    null,
  );

  const [selected, setSelected] = useState("");
  const [customName, setCustomName] = useState("");
  const [customState, customAction] = useActionState(createCustomSource, null);

  // Choosing "Other" reveals a name field, so a user-specific source can be
  // created inline instead of bouncing them to settings.
  const isOther =
    available.find((s) => String(s.id) === selected)?.slug === "other";

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4">
      {isOther ? (
        <form action={customAction} className="grid gap-2">
          <Label htmlFor="custom-name">Name this source</Label>
          <div className="flex gap-2">
            <Input
              id="custom-name"
              name="name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Asura Scans"
              required
            />
            <SubmitButton className="rounded-pill px-4">Create</SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">
            Only you will see this source. It groups under “Other” elsewhere.
          </p>
          {customState?.error ? (
            <p role="alert" className="text-sm text-alert">
              {customState.error}
            </p>
          ) : null}
          {customState?.message ? (
            <p className="text-sm text-muted-foreground">
              {customState.message} Pick it from the list below.
            </p>
          ) : null}
        </form>
      ) : null}

      <form action={action} className="grid gap-3">
        <input type="hidden" name="entry_id" value={entryId} />

        <div className="grid gap-2">
          <Label htmlFor="source_id">Source</Label>
          <select
            id="source_id"
            name="source_id"
            required
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
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

        <SourceFields />

        {state?.error ? (
          <p role="alert" className="text-sm text-alert">
            {state.error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <SubmitButton className="rounded-pill bg-brand px-6 font-bold text-brand-foreground hover:bg-brand/90">
            Add
          </SubmitButton>
          <Button
            type="button"
            variant="ghost"
            className="rounded-pill"
            onClick={onDone}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function EditSourceForm({
  entryId,
  source,
  onDone,
}: {
  entryId: number;
  source: EntrySource;
  onDone: () => void;
}) {
  const [state, action] = useActionState<EntrySourceState, FormData>(
    async (prev, formData) => {
      const result = await updateEntrySource(prev, formData);
      if (result?.message) onDone();
      return result;
    },
    null,
  );

  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border border-border bg-card p-4"
    >
      <input type="hidden" name="id" value={source.id} />
      <input type="hidden" name="entry_id" value={entryId} />

      <div className="flex items-center justify-between">
        <p className="font-medium">{source.sources?.name}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-pill"
          onClick={onDone}
          aria-label="Cancel editing"
        >
          <X className="size-4" />
        </Button>
      </div>

      <SourceFields source={source} />

      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="rounded-pill bg-brand px-6 font-bold text-brand-foreground hover:bg-brand/90">
        Save
      </SubmitButton>
    </form>
  );
}

function RemoveButton({
  entryId,
  sourceRowId,
}: {
  entryId: number;
  sourceRowId: number;
}) {
  const [, action] = useActionState(removeEntrySource, null);

  // TODO(confirm-destructive): this deletes immediately on click, with no undo.
  // The URL, per-source progress, and notes are hand-entered and unrecoverable
  // — the one kind of data in this app that a sync cannot rebuild. Wrap in the
  // AlertDialog from components/ui/alert-dialog.tsx (already installed, not yet
  // used anywhere). See TODO.md.
  return (
    <form action={action}>
      <input type="hidden" name="id" value={sourceRowId} />
      <input type="hidden" name="entry_id" value={entryId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="rounded-pill text-muted-foreground hover:text-alert"
        aria-label="Remove source"
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}
