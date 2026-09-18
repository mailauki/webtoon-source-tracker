"use client";

import Link from "next/link";
import { useState } from "react";
import { Ellipsis, ExternalLink } from "lucide-react";

import { CoverImage } from "@/components/cover-image";
import {
  EntryCardMenu,
  type SourceDialogRequest,
} from "@/components/entry-card-menu";
import { EntrySourceDialog } from "@/components/entry-source-dialog";
import {
  HiatusBadge,
  NoSourceBadge,
  OwnedBadge,
  SourceBadge,
} from "@/components/source-badge";
import { EntryCardSheet } from "@/components/entry-card-sheet";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ownsEveryChapter } from "@/lib/data/chapter-ranges";
import { chapterTotal } from "@/lib/data/chapter-totals";
import type { LibraryRow } from "@/lib/data/entries";
import { isOnHiatus } from "@/lib/data/pick-random";
import type { RankedSource } from "@/lib/data/rank-sources";
import type { Source } from "@/lib/data/rank-sources";
import { readingLink } from "@/lib/data/source-links";

const STATUS_LABELS: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
  plan_to_read: "Plan to read",
};

/** "42 / 179" — an em dash stands in for an unknown total (ongoing series). */
function progressLabel(read: number, total: number | null): string {
  return `${read} / ${total && total > 0 ? total : "—"}`;
}

export function EntryCard({
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

  // Primary source first, so the most relevant pill is never the one truncated.
  const ordered = [...sources].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  const visible = ordered.slice(0, 2);
  const overflow = ordered.length - visible.length;

  // Only when every source has paused — see isOnHiatus.
  const onHiatus = isOnHiatus(entry);

  // The corner badge is reserved for owning the series outright — see
  // ownsEveryChapter. Owning *some* of it is already said by the bookmark on
  // the source pill below, and a badge that appeared after one bought chapter
  // would be the loudest thing on a card while meaning the least.
  //
  // Can be true alongside onHiatus: a completed series you bought and that has
  // since stopped updating somewhere is both.
  //
  // `malTotal` is named apart from `total` below, which is the raw chapter
  // count the progress bar divides by.
  const malTotal = chapterTotal(title);
  const ownedOutright = ownsEveryChapter(sources, malTotal);

  // Where to read this, if anywhere is recorded. See readingLink.
  const readAt = readingLink(sources);

  const total = title.num_chapters;
  const pct =
    total && total > 0
      ? Math.min(100, Math.round((entry.num_chapters_read / total) * 100))
      : 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* The corner controls cannot live inside the card link: the parser
        hoists a nested anchor out of its parent, so the server markup and the
        client tree disagree and hydration fails. They sit side by side under
        this wrapper instead, which is what the cover's hover zoom keys off,
        what the corner controls position against, and what right-click
        triggers the menu from. */}
        <div className="group/card relative">
          <Link
            href={`/entry/${entry.id}`}
            // Labelled with the title alone. Without it the accessible name is
            // everything inside — cover alt, badges, status, progress — read
            // out as one run-on string.
            aria-label={title.title}
            className="group block focus-visible:outline-none"
          >
            {/* 1:2 portrait, matching Tapas. MAL covers are ~2:3, so object-cover
            crops rather than distorts. */}
            <div className="relative aspect-[1/2] overflow-hidden rounded-md bg-muted ring-offset-background group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
              <CoverImage
                src={title.main_picture_url}
                title={title.title}
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 130px"
                className="object-cover transition-transform duration-200 group-hover/card:scale-105"
              />

              {/* Bottom-up scrim so white text stays legible over any artwork. */}
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

              <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 p-1.5">
                {sources.length === 0 ? <NoSourceBadge overlay /> : null}
                {onHiatus ? <HiatusBadge overlay /> : null}
                {/* Last of the three, so the states that need acting on —
                    nothing recorded, or nothing updating — stay leftmost.
                    Owning something is settled news. */}
                {ownedOutright ? <OwnedBadge overlay /> : null}
              </div>

              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2">
                <h3 className="line-clamp-3 text-center font-display text-sm font-bold leading-tight text-white drop-shadow">
                  {title.title}
                </h3>

                <div className="flex flex-wrap items-center justify-center gap-1">
                  {visible.map((es) =>
                    es.sources ? (
                      <SourceBadge
                        key={es.id}
                        overlay
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
                    <span className="rounded-badge bg-white/20 px-1 text-[10px] font-bold text-white backdrop-blur-sm">
                      +{overflow}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-1.5 space-y-1">
              <p className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {STATUS_LABELS[entry.list_status] ?? entry.list_status}
                </span>
                <span className="tabular-nums">
                  {progressLabel(entry.num_chapters_read, total)}
                </span>
              </p>

              {/* Only meaningful when the total is known; ongoing series have none. */}
              {total && total > 0 ? (
                <div
                  className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
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
          </Link>

          {/* The corner controls, in one cluster opposite the status badges
          rather than over the title.

          Both overlay cover art, so every pixel they grow is artwork they
          hide — the read link is sized for a finger on touch and left alone on
          a pointer, and the ⋯ button exists only on touch. */}
          <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
            {/* The card owns the tap; this owns the read. Always visible: on
            touch there is no hover to reveal it, and "where do I read this" is
            the question the shelf exists to answer.

            Only the primary source gets a button. The rest are in the menu,
            which is the surface built for the full list. */}
            {readAt ? (
              <a
                href={readAt.url!}
                target="_blank"
                rel="noopener noreferrer"
                title={`Read on ${readAt.sources!.name}`}
                aria-label={`Read ${title.title} on ${readAt.sources!.name}`}
                className="inline-flex size-7 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur-sm transition-colors hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background pointer-coarse:size-10 pointer-coarse:[&_svg]:size-5"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}

            {/* Visible on touch, and on a mouse only once focused.

            A pointer reaches these actions by right-clicking the card, so a
            button sitting there permanently would be clutter over the
            artwork. But `hidden` would take it out of the tab order too, and
            a keyboard has no right-click — leaving Shift+F10 as the only way
            in. `sr-only` keeps it reachable by Tab and announced by a screen
            reader while showing nothing, and focus brings it back into view so
            a sighted keyboard user can see where they are.

            Gated by media query rather than by measuring the pointer in JS,
            which keeps it out of the hydration path — no pop-in on the first
            paint of a phone. */}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label={`Actions for ${title.title}`}
              className="inline-flex size-10 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur-sm transition-colors hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background pointer-fine:sr-only pointer-fine:focus-visible:not-sr-only"
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
        // The row already carries MAL's count, so the quick-edit dialog can
        // offer the same "own all" shortcut the entry page does.
        total={malTotal}
        onClose={() => setDialog(null)}
      />
    </ContextMenu>
  );
}
