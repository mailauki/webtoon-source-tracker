"use client";

import Link from "next/link";
import { useState } from "react";
import { Ellipsis, ExternalLink } from "lucide-react";

import { CoverImage } from "@/components/cover-image";
import {
  EntryCardMenu,
  type SourceDialogRequest,
} from "@/components/entry-card-menu";
import { EntryCardSheet } from "@/components/entry-card-sheet";
import { STATUS_LABELS, progressLabel } from "@/components/entry-card";
import { EntrySourceDialog } from "@/components/entry-source-dialog";
import {
  HiatusBadge,
  NoSourceBadge,
  OwnedBadge,
  SourceBadge,
} from "@/components/source-badge";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ownsEveryChapter } from "@/lib/data/chapter-ranges";
import { chapterTotal } from "@/lib/data/chapter-totals";
import type { LibraryRow } from "@/lib/data/entries";
import { isOnHiatus } from "@/lib/data/pick-random";
import type { RankedSource, Source } from "@/lib/data/rank-sources";
import { readingLink } from "@/lib/data/source-links";

/**
 * One shelf entry as a horizontal row — the framed card's vocabulary (a solid
 * surface, a title block, a divided stat strip) laid on its side.
 *
 * Built for a list view that does not exist yet: nothing renders this, and
 * LibraryGrid still only knows about EntryCard. It is here so the layout
 * switch, when it lands, is a choice between two components rather than a
 * rewrite. See EntryCard for the grid's overlay treatment.
 *
 * Every behaviour is deliberately identical to the card's — same entry link,
 * same read-through link, same right-click menu, same touch sheet, same
 * dialog. A row is a different shape for the same entry, not a different set
 * of things you can do to it, and two surfaces that diverge would be a bug
 * report waiting to happen.
 *
 * ponytail: duplicates the card's overlay/badge derivation rather than sharing
 * a hook. Two callers is not yet a pattern, and the extraction is cheap to do
 * later — lift it when a third view needs the same values.
 */
export function EntryRow({
  entry,
  topSources = [],
  catalog = [],
}: {
  entry: LibraryRow;
  topSources?: RankedSource[];
  catalog?: Source[];
}) {
  // Both live outside <ContextMenuContent> — Radix unmounts menu content on
  // close and would take them with it.
  const [dialog, setDialog] = useState<SourceDialogRequest | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const title = entry.media_titles;
  const sources = entry.entry_sources;

  // Primary source first, so the most relevant pill is never the one dropped.
  const ordered = [...sources].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  // A row is wider than a card, so it can carry one more pill before the
  // overflow count takes over.
  const visible = ordered.slice(0, 3);
  const overflow = ordered.length - visible.length;

  const onHiatus = isOnHiatus(entry);

  // Reserved for owning the series outright — see ownsEveryChapter, and the
  // longer note in EntryCard for why partial ownership gets no badge.
  const malTotal = chapterTotal(title);
  const ownedOutright = ownsEveryChapter(sources, malTotal);

  const readAt = readingLink(sources);

  const total = title.num_chapters;
  const pct =
    total && total > 0
      ? Math.min(100, Math.round((entry.num_chapters_read / total) * 100))
      : 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* Same wrapper split as the card: the trailing controls are anchors
        and buttons, and nesting an anchor inside the row link would be hoisted
        out by the parser and break hydration. */}
        <div className="group/row relative">
          <Link
            href={`/entry/${entry.id}`}
            // The title alone, or the accessible name is the whole row —
            // cover alt, badges, status, both stats — as one run-on string.
            aria-label={title.title}
            // `pr-24` keeps the text clear of the controls parked on the right.
            className="group flex items-stretch gap-3 overflow-hidden rounded-xl border border-border bg-card pr-24 shadow-sm ring-offset-background transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {/* A portrait thumbnail at the leading edge. Fixed width so every
            row's text starts on the same line however tall the row grows. */}
            <div className="relative w-16 shrink-0 self-stretch overflow-hidden bg-muted">
              <CoverImage
                src={title.main_picture_url}
                title={title.title}
                sizes="64px"
                className="object-cover transition-transform duration-200 group-hover/row:scale-105"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h3 className="truncate font-display text-sm font-bold leading-tight">
                  {title.title}
                </h3>
                {/* Inline with the title rather than over artwork, so these
                take their on-page treatment — `overlay` is for cover art. */}
                {sources.length === 0 ? <NoSourceBadge /> : null}
                {onHiatus ? <HiatusBadge /> : null}
                {ownedOutright ? <OwnedBadge /> : null}
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {STATUS_LABELS[entry.list_status] ?? entry.list_status}
                </span>
                {visible.map((es) =>
                  es.sources ? (
                    <SourceBadge
                      key={es.id}
                      source={{
                        name: es.sources.name,
                        isPrimary: es.is_primary,
                        isPaid: es.is_paid,
                        isOfficial: es.is_official,
                        isHiatus: es.is_hiatus,
                        isOwned: es.is_owned,
                      }}
                    />
                  ) : null,
                )}
                {overflow > 0 ? (
                  <span className="rounded-pill bg-secondary px-2 text-[11px] font-semibold text-secondary-foreground">
                    +{overflow}
                  </span>
                ) : null}
              </div>

              {/* The progress bar sits under the text rather than along the
              row's edge: a row is short enough that a hairline on the border
                 would read as part of the border. Only drawn when there is a
              total to divide by. */}
              {total && total > 0 ? (
                <div
                  className="h-1 w-full max-w-48 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${pct}% read`}
                >
                  <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
            </div>

            {/* The stat strip, turned on its side: the framed card's divided
            cells as columns at the trailing edge. Hidden on a phone, where the
            row has no width to spare — the title and chips are what matter
            there, and the numbers are one tap away on the entry page. */}
            <div className="hidden shrink-0 items-stretch divide-x divide-border border-l border-border bg-muted/50 text-center sm:flex">
              <div className="flex w-20 flex-col justify-center px-2 py-1.5">
                <p className="text-[9px] leading-none text-muted-foreground">
                  Read
                </p>
                <p className="mt-0.5 truncate text-[11px] font-bold leading-none whitespace-nowrap tabular-nums">
                  {progressLabel(entry.num_chapters_read, total)}
                </p>
              </div>
              <div className="flex w-16 flex-col justify-center px-2 py-1.5">
                <p className="text-[9px] leading-none text-muted-foreground">
                  Progress
                </p>
                <p className="mt-0.5 text-[11px] font-bold leading-none tabular-nums">
                  {/* No known total means no percentage to report — an
                  ongoing series would otherwise read as a confident 0%. */}
                  {total && total > 0 ? `${pct}%` : "—"}
                </p>
              </div>
            </div>
          </Link>

          {/* Parked at the trailing edge, vertically centred. Same pair as the
          card: the read link is always there (on touch there is no hover to
          reveal it), and the ⋯ button is touch-only, staying reachable by Tab
          on a pointer via sr-only. See EntryCard for the full reasoning. */}
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {readAt ? (
              <a
                href={readAt.url!}
                target="_blank"
                rel="noopener noreferrer"
                title={`Read on ${readAt.sources!.name}`}
                aria-label={`Read ${title.title} on ${readAt.sources!.name}`}
                className="inline-flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background pointer-coarse:size-10"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}

            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label={`Actions for ${title.title}`}
              className="inline-flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background pointer-fine:sr-only pointer-fine:focus-visible:not-sr-only"
            >
              <Ellipsis className="size-5" />
            </button>
          </div>
        </div>
      </ContextMenuTrigger>

      <EntryCardMenu
        entry={entry}
        topSources={topSources}
        onOpenDialog={setDialog}
      />

      {/* Both sit outside <ContextMenuContent>: Radix unmounts menu content on
      close and would take them with it. */}
      <EntryCardSheet
        entry={entry}
        entryTitle={title.title}
        topSources={topSources}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onOpenDialog={setDialog}
      />

      <EntrySourceDialog
        entryId={entry.id}
        entryTitle={title.title}
        request={dialog}
        attached={entry.entry_sources}
        catalog={catalog}
        total={malTotal}
        onClose={() => setDialog(null)}
      />
    </ContextMenu>
  );
}
