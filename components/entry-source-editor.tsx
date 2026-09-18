"use client";

import { useActionState, useState } from "react";
import {
  BookmarkCheck,
  Crown,
  Lock,
  PauseCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

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
import {
  countChapters,
  formatRanges,
  fromMultirange,
  gapsWithin,
  unionRanges,
} from "@/lib/data/chapter-ranges";
import { ownedCountLabel, type ChapterTotal } from "@/lib/data/chapter-totals";
import type { Source } from "@/lib/data/rank-sources";

export function EntrySourceEditor({
  entryId,
  sources,
  catalog,
  total = null,
}: {
  entryId: number;
  sources: EntrySource[];
  catalog: Source[];
  /** MAL's chapter count for this title, for the "own all" shortcut. */
  total?: ChapterTotal | null;
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

      <OwnedAcrossSources sources={sources} total={total} />

      {adding ? (
        <AddSourceForm
          entryId={entryId}
          available={available}
          total={total}
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
                total={total}
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
                  {source.is_hiatus ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <PauseCircle className="size-3" /> On hiatus
                    </span>
                  ) : null}
                  {/* Muted like Paid and On hiatus, not a brand pill like
                      Primary. Primary is structural — exactly one row can hold
                      it — while these four are all just facts about this row,
                      and a second brand pill beside the crown would dilute it.
                      The emphasis ownership deserves lives on the library
                      card, where a shelf is being scanned. */}
                  {source.is_owned ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <BookmarkCheck className="size-3" /> Owned
                    </span>
                  ) : null}
                </div>

                {source.chapters_read !== null ? (
                  <p className="text-sm text-muted-foreground">
                    Up to chapter {source.chapters_read} here
                  </p>
                ) : null}

                {/* Gated on is_owned, not just on the count being set. The
                    form keeps a count through an unticking of Owned so it is
                    not lost, which means an unticked source can still carry
                    one — and reporting that as owned would contradict the flag
                    everything else reads.

                    A null count on an owned source says nothing rather than
                    zero: "owned, not counted" is a real answer. */}
                {source.is_owned ? (
                  <OwnedHere source={source} total={total} />
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

/**
 * What one source contributes, on its own row.
 *
 * Two lines rather than one: the count answers "how much", and the ranges
 * answer "which" — and the second is only worth the space when the answer is
 * not a single run, which is the common case.
 *
 * A source marked owned with nothing recorded says nothing at all. "Owned, not
 * counted" is a real answer and a zero would contradict it.
 */
function OwnedHere({
  source,
  total,
}: {
  source: EntrySource;
  total: ChapterTotal | null;
}) {
  const ranges = fromMultirange(source.chapters_owned);
  if (ranges.length === 0) return null;

  return (
    <div className="grid gap-0.5">
      <p className="text-sm text-muted-foreground">
        {ownedCountLabel(countChapters(ranges), total)}
      </p>
      {ranges.length > 1 ? (
        <p className="text-xs text-muted-foreground">{formatRanges(ranges)}</p>
      ) : null}
    </div>
  );
}

/** At most this many gaps are named before the rest are counted instead. */
const GAPS_SHOWN = 3;

/**
 * Everything owned, across every source.
 *
 * The union, never a sum. Sources overlap constantly — the first arc read free
 * on one app and bought on another — so adding the per-source counts would
 * claim the user owns twice what they do. `unionRanges` collapses the overlap;
 * see lib/data/chapter-ranges.ts.
 *
 * Only shown once two sources are owned. With one, the row above it already
 * says the same thing, and repeating it under a heading that promises a
 * synthesis is worse than saying nothing.
 *
 * Unowned sources are excluded even when they carry a range, matching the row
 * above: the form keeps a count through an unticking of Owned so it is not
 * lost, and counting that here would contradict the flag.
 */
function OwnedAcrossSources({
  sources,
  total,
}: {
  sources: EntrySource[];
  total: ChapterTotal | null;
}) {
  const owned = sources.filter((s) => s.is_owned);
  if (owned.length < 2) return null;

  const ranges = unionRanges(owned.map((s) => fromMultirange(s.chapters_owned)));
  if (ranges.length === 0) return null;

  const gaps = gapsWithin(ranges);
  const named = gaps.slice(0, GAPS_SHOWN);
  const rest = gaps.length - named.length;

  return (
    <div className="grid gap-1 rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-medium">
        {ownedCountLabel(countChapters(ranges), total, "in total")}
      </p>
      <p className="text-xs text-muted-foreground">{formatRanges(ranges)}</p>
      {gaps.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Missing {formatRanges(named)}
          {rest > 0 ? ` and ${rest} more gap${rest === 1 ? "" : "s"}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function AddSourceForm({
  entryId,
  available,
  total,
  onDone,
}: {
  entryId: number;
  available: Source[];
  total: ChapterTotal | null;
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

        <SourceFields total={total} />

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
  total,
  onDone,
}: {
  entryId: number;
  source: EntrySource;
  total: ChapterTotal | null;
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

      <SourceFields source={source} total={total} />

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
