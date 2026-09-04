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
import { pickNext, selectCandidates } from "@/lib/data/pick-random";
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

/**
 * "Pick something to read" — a die over the shelf the chips are showing.
 *
 * The chips are the filter. Narrowing to Reading + Webtoon and then rolling is
 * the whole feature; a second set of pickers inside the dialog would be the
 * same choice in two places, free to disagree with what is on screen.
 *
 * Which titles are eligible is `selectCandidates`, the same function the grid
 * narrows with — so what the die can return is always exactly what the user
 * can see.
 */
export function RandomPick() {
  const { entries, status, source, deferredQuery } = useLibraryFilters();

  const [picked, setPicked] = useState<LibraryRow | null>(null);
  // Which titles this run has already offered. Kept as ids rather than rows so
  // it stays valid across the re-renders that bring new row objects.
  const [seen, setSeen] = useState<Set<number>>(new Set());

  const candidates = selectCandidates(entries, { status, source });

  // A search bypasses the chips and is a lookup of one known title, so there is
  // nothing for a die to decide — see lib/data/pick-random.ts.
  if (deferredQuery.trim() !== "") return null;

  function roll() {
    const { entry, reset } = pickNext(candidates, seen);
    if (!entry) return;

    // `pickNext` reports the restart but does not own `seen`; clearing it here
    // is what keeps the second cycle as repeat-free as the first.
    setSeen(reset ? new Set([entry.id]) : new Set(seen).add(entry.id));
    setPicked(entry);
  }

  // One candidate can only ever return itself, so the die says so rather than
  // performing a choice it does not have.
  const disabled = candidates.length < 2;

  // The same choice the card's read button makes — see readingLink — so the
  // shelf and the dice never send you to different places for one title. Null
  // when nothing attached to the pick carries a URL.
  const readAt = picked ? readingLink(picked.entry_sources) : null;

  return (
    <>
      <button
        type="button"
        onClick={roll}
        disabled={disabled}
        aria-label="Pick something to read"
        title={
          disabled
            ? "Not enough titles in this view to pick from"
            : `Pick something to read from ${candidates.length} titles`
        }
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-pill border border-border bg-background/60 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur transition-colors hover:text-foreground",
          disabled && "opacity-40 hover:text-muted-foreground",
        )}
      >
        <Dices className="size-3.5" />
        <span className="max-sm:sr-only">Pick for me</span>
      </button>

      <Dialog
        open={picked !== null}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          {picked ? <PickedTitle entry={picked} /> : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={roll}
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
function PickedTitle({ entry }: { entry: LibraryRow }) {
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
        <DialogDescription>
          Drawn from the titles this view is showing.
        </DialogDescription>
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
