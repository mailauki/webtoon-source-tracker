"use client";

import { useActionState, useOptimistic, useRef, useState, useTransition } from "react";
import { Check, Loader2, Minus, Plus } from "lucide-react";

import { updateProgress, type ProgressState } from "@/app/actions/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntryDetail } from "@/lib/data/entries";

const STATUS_OPTIONS = [
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_read", label: "Plan to read" },
];

export function ProgressEditor({ entry }: { entry: EntryDetail }) {
  const total = entry.media_titles.num_chapters;
  const formRef = useRef<HTMLFormElement>(null);

  const [state, action] = useActionState<ProgressState, FormData>(
    updateProgress,
    null,
  );
  const [isPending, startTransition] = useTransition();

  // The chapter count moves immediately while the MAL round trip (~1s) is in
  // flight. If the action fails, React discards the optimistic value and the
  // server value shows through again — so the UI can never claim a save that
  // did not happen.
  const [optimisticChapters, setOptimisticChapters] = useOptimistic(
    entry.num_chapters_read,
  );

  const [status, setStatus] = useState(entry.list_status);
  const [score, setScore] = useState(entry.score);

  function submitChapters(next: number) {
    const clamped = Math.max(0, total && total > 0 ? Math.min(next, total) : next);
    const formData = new FormData();
    formData.set("entry_id", String(entry.id));
    formData.set("num_chapters_read", String(clamped));

    startTransition(() => {
      setOptimisticChapters(clamped);
      action(formData);
    });
  }

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Progress</h2>
        <p className="text-sm text-muted-foreground">
          Changes are saved to MyAnimeList.
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
              disabled={isPending || optimisticChapters <= 0}
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
              Finishing the last chapter marks this completed on MyAnimeList.
            </p>
          ) : null}
        </div>

        <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="entry_id" value={entry.id} />

          <div className="grid gap-2">
            <Label htmlFor="chapters-exact">Set exactly</Label>
            <Input
              id="chapters-exact"
              name="num_chapters_read"
              type="number"
              min={0}
              max={total && total > 0 ? total : undefined}
              defaultValue={entry.num_chapters_read}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="list_status">Status</Label>
            <select
              id="list_status"
              name="list_status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
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
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
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
              disabled={isPending}
              className="rounded-pill bg-brand px-6 font-bold text-brand-foreground hover:bg-brand/90"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save to MyAnimeList
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
        {state?.ok === true ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4" />
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
