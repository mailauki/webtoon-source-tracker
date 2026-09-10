"use client";

import Link from "next/link";
import Image from "next/image";
import { Dices, ExternalLink } from "lucide-react";
import { useState } from "react";

import { useLibraryFilters } from "@/components/library-grid";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pickNext, selectByMode, type PickMode } from "@/lib/data/pick-random";
import { readingLink } from "@/lib/data/source-links";
import type { LibraryRow } from "@/lib/data/entries";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
  plan_to_read: "Plan to read",
};

/** What each button offers, and what the reveal calls the draw it came from. */
const MODES: { mode: PickMode; label: string; drawnFrom: string }[] = [
  {
    mode: "surprise",
    label: "Surprise me",
    drawnFrom: "Drawn from the titles this view is showing.",
  },
  {
    mode: "neglected",
    label: "Haven't read in a while",
    drawnFrom: "Drawn from the titles you have left sitting the longest.",
  },
  {
    mode: "plan",
    label: "From plan to read",
    drawnFrom: "Drawn from the titles you have been meaning to start.",
  },
];

/**
 * "Not sure what to read?" — a small banner over the shelf.
 *
 * Three questions, not three filters. "Surprise me" is a die over the shelf as
 * the chips have left it, so what it returns is always something the user can
 * see. The other two answer questions the chips cannot express — how long a
 * title has sat, and what was never started — so they reach past the chips to
 * their own pool. Making them narrow within the chips instead would leave the
 * plan-to-read button dead whenever the Reading chip was up, for a reason the
 * user never asked about.
 *
 * Which titles each mode may return is `selectByMode`, next to the same
 * `selectCandidates` the grid narrows with, so the shelf and the dice can
 * never disagree about what "Reading + Webtoon" covers.
 */
export function RandomPick() {
  const { entries, status, source, hideHiatus, deferredQuery } =
    useLibraryFilters();

  const [picked, setPicked] = useState<LibraryRow | null>(null);
  // Which mode produced the title on screen — the reveal names it, and
  // "Roll again" has to draw from the same pool the first press did.
  const [mode, setMode] = useState<PickMode>("surprise");
  // Which titles this run has already offered. Kept as ids rather than rows so
  // it stays valid across the re-renders that bring new row objects.
  const [seen, setSeen] = useState<Set<number>>(new Set());

  // `hideHiatus` rides along with the chips: the toggle is the user saying a
  // paused title is not worth their time, which is as true of a recommendation
  // as it is of the shelf.
  const filters = { status, source, hideHiatus };
  const pools = MODES.map((m) => ({
    ...m,
    candidates: selectByMode(entries, m.mode, filters),
  }));

  // A search bypasses the chips and is a lookup of one known title, so there is
  // nothing for a die to decide — see lib/data/pick-random.ts.
  if (deferredQuery.trim() !== "") return null;

  /**
   * Draw from `next`, carrying `seen` only while the mode holds.
   *
   * Each mode is its own draw: carrying exclusions across a switch would make
   * a small pool find everything already seen on its first press and reset
   * immediately, losing the never-repeat rule on the pool just asked for.
   */
  function roll(next: PickMode) {
    const pool = pools.find((p) => p.mode === next)!.candidates;
    const carried = next === mode ? seen : new Set<number>();

    const { entry, reset } = pickNext(pool, carried);
    if (!entry) return;

    // `pickNext` reports the restart but does not own `seen`; clearing it here
    // is what keeps the second cycle as repeat-free as the first.
    setSeen(reset ? new Set([entry.id]) : new Set(carried).add(entry.id));
    setMode(next);
    setPicked(entry);
  }

  const active = MODES.find((m) => m.mode === mode)!;

  // The same choice the card's read button makes — see readingLink — so the
  // shelf and the dice never send you to different places for one title. Null
  // when nothing attached to the pick carries a URL.
  const readAt = picked ? readingLink(picked.entry_sources) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex min-w-50 flex-1 items-center gap-3">
          <Dices className="size-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold">
              Not sure what to read?
            </p>
            <p className="text-xs text-muted-foreground">
              Let the shelf decide for you.
            </p>
          </div>
        </div>

        {/* The primary leads and the two shortcuts follow it, so the common
            case reads as one button and the other questions stay one press
            away rather than behind a menu. Wraps to its own line on a phone,
            which is why the group is a flex row of its own. */}
        <div className="flex flex-wrap items-center gap-2">
          {pools.map(({ mode: m, label, candidates }) => {
            // One candidate can only ever return itself, so a mode with fewer
            // than two says so rather than performing a choice it lacks.
            const disabled = candidates.length < 2;
            const primary = m === "surprise";

            return (
              <Button
                key={m}
                type="button"
								size="sm"
                onClick={() => roll(m)}
                disabled={disabled}
								variant={primary ? "default" : "outline"}
                title={
                  disabled
                    ? "Not enough titles here to pick from"
                    : `Pick from ${candidates.length} titles`
                }
								className={cn("rounded-full", primary && "bg-brand font-bold text-brand-foreground hover:bg-brand/90")}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      <Dialog
        open={picked !== null}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          {picked ? (
            <PickedTitle entry={picked} drawnFrom={active.drawnFrom} />
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => roll(mode)}
              className="rounded-pill"
            >
              Roll again
            </Button>
            {/* Grouped so the footer stays "re-roll on one side, act on the
                other" with three buttons in it. Reversed on mobile for the
                same reason the footer itself is: the primary action ends up
                nearest the thumb. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {/* Where to actually read it. Offered only when a source carries
                  a URL, on the same reasoning as the card's read button. */}
              {readAt ? (
                <Button asChild variant="outline" className="rounded-pill">
                  <a
                    href={readAt.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink />
                    Read on {readAt.sources!.name}
                  </a>
                </Button>
              ) : null}

              <Button
                asChild
                className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
              >
                <Link href={`/entry/${picked?.id}`}>Open</Link>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The reveal: cover, title, where it is on the shelf, and where to read it. */
function PickedTitle({
  entry,
  drawnFrom,
}: {
  entry: LibraryRow;
  drawnFrom: string;
}) {
  const title = entry.media_titles;
  const total = title.num_chapters;

  // Primary source first, matching the card — the most relevant pill leads.
  const sources = [...entry.entry_sources].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display">Tonight&rsquo;s pick</DialogTitle>
        <DialogDescription>{drawnFrom}</DialogDescription>
      </DialogHeader>

      <div className="flex gap-4">
        <div className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-md bg-muted">
          {title.main_picture_url ? (
            <Image
              src={title.main_picture_url}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="grid content-start gap-1.5">
          <p data-testid="picked-title" className="font-display font-semibold">
            {title.title}
          </p>
          <p className="text-sm text-muted-foreground">
            {STATUS_LABELS[entry.list_status] ?? entry.list_status} ·{" "}
            <span className="tabular-nums">
              {entry.num_chapters_read} / {total && total > 0 ? total : "—"}
            </span>
          </p>

          {sources.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {sources.map((es) => (
                <SourceBadge
                  key={es.id}
                  source={{
                    name: es.sources?.name ?? "Unknown",
                    isPrimary: es.is_primary,
                    isPaid: es.is_paid,
                    isOfficial: es.is_official,
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="pt-1 text-xs text-alert">No source saved yet</p>
          )}
        </div>
      </div>
    </>
  );
}
