"use client";

import {
  startTransition,
  useActionState,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
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
  ownedAcross,
} from "@/lib/data/chapter-ranges";
import { ownedCountLabel, type ChapterTotal } from "@/lib/data/chapter-totals";
import type { RankedSource, Source } from "@/lib/data/rank-sources";
import { submitKeepingFields } from "@/lib/forms/submit-keeping-fields";
import { useSettled } from "@/lib/hooks/use-settled";
import {
  applySourceChange,
  sourceColumnsFrom,
  type SourceChange,
} from "@/lib/sources/optimistic-source";

type ApplyChange = (change: SourceChange<EntrySource>) => void;

/**
 * Ids for rows that exist only optimistically, between an Add and the
 * re-render that brings the saved row. Negative, so they can never collide
 * with a database id.
 */
let pendingId = 0;
const nextPendingId = () => --pendingId;

const NO_LINKS: Record<number, string> = {};
const NO_IDS: ReadonlySet<number> = new Set();

export function EntrySourceEditor({
  entryId,
  sources: saved,
  catalog,
  total = null,
  anilistLinks: storedLinks = NO_LINKS,
  liveAnilistLinks,
  topSources = [],
  isPro,
}: {
  entryId: number;
  sources: EntrySource[];
  catalog: Source[];
  /** MAL's chapter count for this title, for the "own all" shortcut. */
  total?: ChapterTotal | null;
  /** AniList's reading link per source id — see catalogLinks. */
  anilistLinks?: Record<number, string>;
  /**
   * The same, streamed in by the entry page once AniList answers. Read here
   * rather than by re-rendering the editor behind Suspense, which remounted
   * it — closing a form someone had open and dropping what they had typed.
   */
  liveAnilistLinks?: Promise<Record<number, string>>;
  /** The sources the user reads on most, offered as one-tap adds. */
  topSources?: RankedSource[];
  /** Owned chapters are Pro-only; a free account sees a teaser instead. */
  isPro: boolean;
}) {
  const [quickAdding, startQuickAdd] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const anilistLinks = useSettled(liveAnilistLinks, storedLinks);

  // Every add, edit and removal shows at once and holds until the save's
  // re-render brings the stored rows — so a closed form never flashes the
  // row's old values before the new ones arrive. A failed save drops the
  // change and the stored rows show through again.
  const [sources, applyChange] = useOptimistic(
    saved,
    applySourceChange<EntrySource>,
  );
  // Rows being removed are hidden, not dropped: the row's own Remove form has
  // to stay mounted for its save to finish, and for the row to come back if
  // the removal is refused.
  const [removing, markRemoving] = useOptimistic(
    NO_IDS,
    (ids: ReadonlySet<number>, id: number) => new Set(ids).add(id),
  );
  const listed = sources.filter((s) => !removing.has(s.id));

  const attachedIds = new Set(listed.map((s) => s.sources?.id));
  const available = catalog.filter((c) => !attachedIds.has(c.id));
  const quickAdds = topSources.filter((s) => !attachedIds.has(s.id));

  return (
    // Anchor kept so /entry/[id]#sources lands on this section.
    <section id="sources" className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">
            Where I read it
          </h2>
          <p className="text-sm text-muted-foreground">
            {listed.length === 0
              ? "No source recorded yet."
              : `${listed.length} ${listed.length === 1 ? "source" : "sources"}`}
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

      <OwnedAcrossSources sources={listed} total={total} />

      {/* The usual sources, one press each, where not already attached. The
          URL and the rest are filled in from the row's Edit afterwards. */}
      {!adding && quickAdds.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {quickAdds.map((source) => (
            <Button
              key={source.id}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-pill"
              disabled={quickAdding}
              onClick={() =>
                startQuickAdd(async () => {
                  const formData = new FormData();
                  formData.set("entry_id", String(entryId));
                  formData.set("source_id", String(source.id));
                  const result = await addEntrySource(null, formData);
                  if (result?.error) toast.error(result.error);
                })
              }
            >
              <Plus className="size-4" />
              Add {source.name}
            </Button>
          ))}
        </div>
      ) : null}

      {adding ? (
        <AddSourceForm
          entryId={entryId}
          available={available}
          total={total}
          anilistLinks={anilistLinks}
          isPro={isPro}
          onChange={applyChange}
          onDone={() => setAdding(false)}
        />
      ) : null}

      {listed.length === 0 && !adding ? (
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
                isPro={isPro}
                onChange={applyChange}
                onDone={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={source.id}
              // A row still being added has no id to edit or remove by yet.
              aria-busy={source.id < 0 || undefined}
              hidden={removing.has(source.id)}
              className={`flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3 ${
                source.id < 0 ? "opacity-60" : ""
              }`}
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
                  disabled={source.id < 0}
                  aria-label={`Edit ${source.sources?.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <RemoveButton
                  entryId={entryId}
                  sourceRowId={source.id}
                  onRemove={markRemoving}
                />
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
  if (sources.filter((s) => s.is_owned).length < 2) return null;

  const ranges = ownedAcross(sources);
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
  anilistLinks,
  isPro,
  onChange,
  onDone,
}: {
  entryId: number;
  available: Source[];
  total: ChapterTotal | null;
  anilistLinks: Record<number, string>;
  isPro: boolean;
  onChange: ApplyChange;
  onDone: () => void;
}) {
  const [state, action, isPending] = useActionState<EntrySourceState, FormData>(
    async (prev, formData) => {
      addOptimistically(formData, available, onChange);
      const result = await addEntrySource(prev, formData);
      if (result?.message) startTransition(onDone);
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

  // Sources AniList has a link for that are not on this entry yet.
  const quickAdds = available.filter((s) => anilistLinks[s.id]);

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4">
      {quickAdds.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Add from AniList</p>
          <ul className="grid gap-2">
            {quickAdds.map((s) => (
              <QuickAdd
                key={s.id}
                entryId={entryId}
                source={s}
                url={anilistLinks[s.id]}
                onChange={onChange}
                onDone={onDone}
              />
            ))}
          </ul>
        </div>
      ) : null}

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

      <form onSubmit={submitKeepingFields(action)} className="grid gap-3">
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

        <SourceFields
          total={total}
          suggestedUrl={selected ? anilistLinks[Number(selected)] : null}
          isPro={isPro}
        />

        {state?.error ? (
          <p role="alert" className="text-sm text-alert">
            {state.error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <SubmitButton
            pending={isPending}
            className="rounded-pill bg-brand px-6 font-bold text-brand-foreground hover:bg-brand/90"
          >
            {isPending ? "Adding…" : "Add"}
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

/**
 * One tap to attach a source AniList lists, with AniList's link.
 *
 * Its own form beside the main one (forms cannot nest), and the only fields
 * it sets are the source and the link: anything else is a normal edit away.
 *
 * Closes the whole add form on success, like the main Add button does: the
 * source now sits in the list below, and a form left open beside it would
 * read as a second step still waiting.
 */
function QuickAdd({
  entryId,
  source,
  url,
  onChange,
  onDone,
}: {
  entryId: number;
  source: Source;
  url: string;
  onChange: ApplyChange;
  onDone: () => void;
}) {
  const [state, action] = useActionState<EntrySourceState, FormData>(
    async (prev, formData) => {
      addOptimistically(formData, [source], onChange);
      const result = await addEntrySource(prev, formData);
      if (result?.message) startTransition(onDone);
      return result;
    },
    null,
  );

  return (
    <li className="grid gap-1">
      <form action={action} className="flex items-center justify-between gap-3">
        <input type="hidden" name="entry_id" value={entryId} />
        <input type="hidden" name="source_id" value={source.id} />
        <input type="hidden" name="url" value={url} />
        {/* addEntrySource reads an absent checkbox as unticked, and a site
            AniList lists as a reading link is an official one. */}
        <input type="hidden" name="is_official" value="on" />

        <div className="min-w-0 text-sm">
          <p className="font-medium">{source.name}</p>
          <p className="truncate text-xs text-muted-foreground">{url}</p>
        </div>

        <SubmitButton className="h-8 shrink-0 rounded-pill px-3">
          <Plus className="size-4" />
          Add
        </SubmitButton>
      </form>
      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

function EditSourceForm({
  entryId,
  source,
  total,
  isPro,
  onChange,
  onDone,
}: {
  entryId: number;
  source: EntrySource;
  total: ChapterTotal | null;
  isPro: boolean;
  onChange: ApplyChange;
  onDone: () => void;
}) {
  const [state, action, isPending] = useActionState<EntrySourceState, FormData>(
    async (prev, formData) => {
      const columns = sourceColumnsFrom(formData);
      if (columns) onChange({ type: "update", id: source.id, columns });
      // Closed in a transition, as are the other forms here: closing after
      // the await as a plain update committed before the page's re-render,
      // so the row showed its old values for a beat after a save.
      const result = await updateEntrySource(prev, formData);
      if (result?.message) startTransition(onDone);
      return result;
    },
    null,
  );

  return (
    <form
      onSubmit={submitKeepingFields(action)}
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

      <SourceFields source={source} total={total} isPro={isPro} />

      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton
        pending={isPending}
        className="rounded-pill bg-brand px-6 font-bold text-brand-foreground hover:bg-brand/90"
      >
        {isPending ? "Saving…" : "Save"}
      </SubmitButton>
    </form>
  );
}

function RemoveButton({
  entryId,
  sourceRowId,
  onRemove,
}: {
  entryId: number;
  sourceRowId: number;
  onRemove: (id: number) => void;
}) {
  const [, action, isPending] = useActionState<EntrySourceState, FormData>(
    async (prev, formData) => {
      onRemove(sourceRowId);
      return removeEntrySource(prev, formData);
    },
    null,
  );

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
        disabled={sourceRowId < 0 || isPending}
        aria-label="Remove source"
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}

/**
 * Shows a source being added as a row straight away, named from the catalog
 * it was picked from. Skipped when the form would be refused, or names a
 * source this list does not know.
 */
function addOptimistically(
  formData: FormData,
  catalog: Source[],
  onChange: ApplyChange,
) {
  const columns = sourceColumnsFrom(formData);
  const picked = catalog.find(
    (s) => String(s.id) === String(formData.get("source_id")),
  );
  if (!columns || !picked) return;
  onChange({
    type: "add",
    row: {
      id: nextPendingId(),
      ...columns,
      sources: { id: picked.id, name: picked.name },
    },
  });
}
