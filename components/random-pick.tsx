"use client";

import Link from "next/link";
import { Dices, ExternalLink, Sparkles } from "lucide-react";
import { useState } from "react";

import { CoverImage } from "@/components/cover-image";
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
import { PRO_MESSAGES } from "@/lib/pro";
import { pickNext, selectByMode, type PickMode } from "@/lib/data/pick-random";
import { readingLink } from "@/lib/data/source-links";
import type { LibraryRow } from "@/lib/data/entries";
import { displayTitle } from "@/lib/data/display-title";
import { entryCover } from "@/lib/data/entry-cover";
import { statusLabel } from "@/lib/data/entry-labels";

/** What each button offers, and what the reveal calls the draw it came from. */
const MODES: { mode: PickMode; label: string; drawnFrom: string }[] = [
  {
    mode: "surprise",
    label: "Surprise me",
    drawnFrom: "Drawn from your whole library.",
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
 * "Not sure what to read?" — a banner on Discover, as in the iOS app.
 *
 * It used to sit in the library's control row and roll over the shelf as the
 * filters had left it. Discover is where "what should I read next" is asked,
 * so it lives there now and draws from the whole library, less what the user
 * has ruled out for good: adult titles (already screened by getLibrary), and
 * the hiatus and owned-only toggles, which say a title is not worth offering.
 *
 * For Pro. Without it each button leads to /pro, so the feature is still
 * there to find.
 */
export function RandomPick({
  isPro,
  entries,
  hideHiatus = false,
  ownedOnly = false,
}: {
  isPro: boolean;
  entries: LibraryRow[];
  hideHiatus?: boolean;
  ownedOnly?: boolean;
}) {
  const [picked, setPicked] = useState<LibraryRow | null>(null);
  // Which mode produced the title on screen — the reveal names it, and
  // "Roll again" has to draw from the same pool the first press did.
  const [mode, setMode] = useState<PickMode>("surprise");
  // Which titles this run has already offered. Kept as ids rather than rows so
  // it stays valid across the re-renders that bring new row objects.
  const [seen, setSeen] = useState<Set<number>>(new Set());

  const filters = { status: "", source: "", hideHiatus, ownedOnly };
  const pools = MODES.map((m) => ({
    ...m,
    candidates: selectByMode(entries, m.mode, filters),
  }));

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
    <section className="grid gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <Dices className="size-5 shrink-0 text-brand" aria-hidden />
        <p className="font-display text-sm font-semibold">
          Not sure what to read?
        </p>
        {isPro ? null : (
          <Sparkles aria-hidden className="ml-auto size-4 text-brand" />
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {pools.map(({ mode: m, label, candidates }) => {
          // One candidate can only ever return itself, so a mode with fewer
          // than two says so rather than performing a choice it lacks.
          const tooFew = candidates.length < 2;
          const count = (
            <span className="ml-auto pl-4 text-xs text-muted-foreground tabular-nums">
              {tooFew ? "Too few" : `${candidates.length} titles`}
            </span>
          );
          return isPro ? (
            <Button
              key={m}
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={tooFew}
              onClick={() => roll(m)}
            >
              {label}
              {count}
            </Button>
          ) : (
            <Button key={m} asChild variant="outline" className="rounded-full">
              <Link href="/pro" title={PRO_MESSAGES.pick}>
                {label}
                {count}
                <span className="sr-only">: {PRO_MESSAGES.pick} Get Pro</span>
              </Link>
            </Button>
          );
        })}
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
    </section>
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
          <CoverImage
            src={entryCover(entry)}
            title={displayTitle(title)}
            sizes="96px"
            className="object-cover"
          />
        </div>

        <div className="grid content-start gap-1.5">
          <p data-testid="picked-title" className="font-display font-semibold">
            {displayTitle(title)}
          </p>
          <p className="text-sm text-muted-foreground">
            {statusLabel(entry.list_status)} ·{" "}
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
