"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Check, Loader2, Minus, Plus } from "lucide-react";

import { updateProgress, type ProgressState } from "@/app/actions/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntryDetail } from "@/lib/data/entries";
import { syncTargets } from "@/lib/data/sync-targets";
import { useSettled } from "@/lib/hooks/use-settled";

const STATUS_OPTIONS = [
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_read", label: "Plan to read" },
];

type Progress = {
  num_chapters_read: number;
  list_status: string;
  score: number;
};

export function ProgressEditor({
  entry,
  total: storedTotal = entry.media_titles.num_chapters,
  liveTotal,
}: {
  entry: EntryDetail;
  /**
   * The chapter count to count up to until `liveTotal` settles: the stored
   * one, unless the caller already knows better.
   */
  total?: number | null;
  /**
   * The higher of MyAnimeList's and AniList's counts, streamed in by the
   * entry page. Read here rather than by re-rendering the editor behind
   * Suspense, which remounted it and threw away whatever was being typed.
   */
  liveTotal?: Promise<number | null>;
}) {
  // Shared with the library card's menu and sheet, which submit the same
  // action — see lib/data/sync-targets.ts.
  const { targets, nowhereToSave, label: remote } = syncTargets(entry);
  const total = useSettled(liveTotal, storedTotal) ?? storedTotal;

  // What the database holds right now. Every save re-renders the page with
  // the values MyAnimeList echoed back, which is what this follows.
  const saved: Progress = {
    num_chapters_read: entry.num_chapters_read,
    list_status: entry.list_status,
    score: entry.score,
  };

  // Every field moves the moment it is saved, while the MAL round trip (~1s)
  // is in flight, and stays moved until the re-render carrying the saved row
  // lands — so there is no moment where the page shows the old value after a
  // save. If the action fails, React discards the optimistic value and the
  // saved one shows through again, so the UI never claims a save that did
  // not happen.
  const [shown, applyOptimistic] = useOptimistic(
    saved,
    (current: Progress, patch: Partial<Progress>) => ({ ...current, ...patch }),
  );

  // The form's own fields. Controlled, and reset whenever the saved row
  // changes: the exact-chapters box used to be a `defaultValue`, which React
  // never updates, so after a +1 or a save MAL clamped it kept showing the
  // number that was typed rather than the one that was stored.
  const [draft, setDraft] = useState(() => toDraft(saved));
  const [seen, setSeen] = useState(saved);
  if (!sameProgress(seen, saved)) {
    setSeen(saved);
    setDraft(toDraft(saved));
  }

  const [state, action, isPending] = useActionState<ProgressState, FormData>(
    async (prev, formData) => {
      applyOptimistic(patchFrom(formData, total));
      return updateProgress(prev, formData);
    },
    null,
  );
  const [, startTransition] = useTransition();

  function submitChapters(next: number) {
    const clamped = Math.max(0, total && total > 0 ? Math.min(next, total) : next);
    const formData = new FormData();
    formData.set("entry_id", String(entry.id));
    formData.set("num_chapters_read", String(clamped));
    if (total) formData.set("total", String(total));

    startTransition(() => action(formData));
  }

  const optimisticChapters = shown.num_chapters_read;

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Progress</h2>
        <p className="text-sm text-muted-foreground">
          {nowhereToSave
            ? "This title is only on AniList, and you've turned AniList syncing off for it — so there's nowhere to record progress."
            : `Changes are saved to ${remote}.`}
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-2">
          <Label htmlFor="chapters">Chapters read</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-pill"
              disabled={isPending || nowhereToSave || optimisticChapters <= 0}
              onClick={() => submitChapters(optimisticChapters - 1)}
              aria-label="One chapter back"
            >
              <Minus className="size-4" />
            </Button>

            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="font-display text-2xl font-bold">
                {optimisticChapters}
              </span>
              <span className="text-muted-foreground">
                / {total && total > 0 ? total : "—"}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-pill"
              disabled={
                isPending ||
                nowhereToSave ||
                (total !== null && total > 0 && optimisticChapters >= total)
              }
              onClick={() => submitChapters(optimisticChapters + 1)}
              aria-label="One chapter forward"
            >
              <Plus className="size-4" />
            </Button>

            {isPending ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {total && total > 0 && optimisticChapters >= total ? (
            <p className="text-xs text-muted-foreground">
              Finishing the last chapter marks this completed
              {targets.length > 0 ? ` on ${remote}` : ""}.
            </p>
          ) : null}
        </div>

        <form action={action} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="entry_id" value={entry.id} />
          {total ? <input type="hidden" name="total" value={total} /> : null}

          <div className="grid gap-2">
            <Label htmlFor="chapters-exact">Set exactly</Label>
            <Input
              id="chapters-exact"
              name="num_chapters_read"
              type="number"
              min={0}
              max={total && total > 0 ? total : undefined}
              value={draft.chapters}
              onChange={(e) =>
                setDraft((d) => ({ ...d, chapters: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="list_status">Status</Label>
            <select
              id="list_status"
              name="list_status"
              value={draft.status}
              onChange={(e) =>
                setDraft((d) => ({ ...d, status: e.target.value }))
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="score">Score</Label>
            <select
              id="score"
              name="score"
              value={draft.score}
              onChange={(e) =>
                setDraft((d) => ({ ...d, score: Number(e.target.value) }))
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value={0}>Not scored</option>
              {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <Button
              type="submit"
              // Disabled rather than left to fail on submit: the action
              // refuses this case, and letting someone type a chapter number
              // before telling them is the worse of the two.
              disabled={isPending || nowhereToSave}
              className="rounded-pill bg-brand px-6 font-bold text-brand-foreground hover:bg-brand/90"
            >
              {isPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : null}
              {isPending
                ? "Saving…"
                : targets.length > 0
                  ? `Save to ${remote}`
                  : "Save"}
            </Button>
          </div>
        </form>

        {state?.ok === false ? (
          <p role="alert" className="text-sm text-alert">
            {state.error}
            {state.needsReauth ? (
              <>
                {" "}
                <a href="/api/mal/connect" className="font-medium underline">
                  Reconnect
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {state?.ok === true && !isPending ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4" />
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function toDraft(progress: Progress) {
  return {
    chapters: String(progress.num_chapters_read),
    status: progress.list_status,
    score: progress.score,
  };
}

function sameProgress(a: Progress, b: Progress): boolean {
  return (
    a.num_chapters_read === b.num_chapters_read &&
    a.list_status === b.list_status &&
    a.score === b.score
  );
}

/**
 * What a submitted form will save, as the save itself reads it — including
 * the auto-complete it applies when the last chapter is reached with no
 * status sent (see lib/progress/save-progress.ts), so the optimistic status
 * agrees with the one the re-render will bring.
 */
function patchFrom(
  formData: FormData,
  total: number | null | undefined,
): Partial<Progress> {
  const patch: Partial<Progress> = {};
  const chapters = formData.get("num_chapters_read");
  if (typeof chapters === "string" && chapters !== "" && Number.isInteger(Number(chapters))) {
    patch.num_chapters_read = Math.max(0, Number(chapters));
  }
  const status = formData.get("list_status");
  if (typeof status === "string" && status !== "") patch.list_status = status;
  const score = formData.get("score");
  if (typeof score === "string" && score !== "") patch.score = Number(score);

  if (
    patch.list_status === undefined &&
    patch.num_chapters_read !== undefined &&
    total &&
    total > 0 &&
    patch.num_chapters_read >= total
  ) {
    patch.list_status = "completed";
  }
  return patch;
}
