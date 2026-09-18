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

/** Shared with EntryRow, which shows the same status wording in list view. */
export const STATUS_LABELS: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
  plan_to_read: "Plan to read",
};

/** "42 / 179" — an em dash stands in for an unknown total (ongoing series). */
export function progressLabel(read: number, total: number | null): string {
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
            // Overlay style: the art IS the card. Everything — title, chips,
            // stats — sits on top of it, so the frame is just a clipping
            // boundary with a radius rather than a surface of its own.
            className="group relative block overflow-hidden rounded-xl bg-muted shadow-sm ring-offset-background transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {/* 9/16 portrait — taller than it is wide, close to the ~2:3 MAL
            covers already come in, so object-cover barely has to crop. The
            overlay rows stack up the lower third rather than across. */}
            <div className="relative aspect-[9/16] overflow-hidden">
              <CoverImage
                src={title.main_picture_url}
                title={title.title}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
                // `object-top` so what little a 9/16 window crops off a ~2:3
                // cover comes off the bottom: webtoon covers put the title
                // logo and the character's face up top.
                className="object-cover object-top transition-transform duration-200 group-hover/card:scale-105"
              />

              {/* Two layers, because white text over unknown artwork needs
              both. The gradient darkens; the blur, faded in from its own
              midpoint by the mask, kills the high-frequency detail that would
              otherwise fight the text. A gradient heavy enough to beat busy
              art on its own buried the cover. */}
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-60 backdrop-blur-lg mask-t-from-50%" />
            </div>

            {/* Status badges, top-left — the reference's "Active" pill. */}
            <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 p-2">
              {sources.length === 0 ? <NoSourceBadge overlay /> : null}
              {onHiatus ? <HiatusBadge overlay /> : null}
              {/* Last of the three, so the states that need acting on —
                  nothing recorded, or nothing updating — stay leftmost.
                  Owning something is settled news. */}
              {ownedOutright ? <OwnedBadge overlay /> : null}
            </div>

            {/* The content stack, bottom-anchored over the art: status and
            title, then the chips, then the stat strip — the reference's title
            block, spec row and footer in that order. */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col p-2 pb-3.5">
              {/* Status over title, in a fixed-height block so the chips and
              the strip below start on the same line whether a title runs to
              one line or two. */}
              <div className="flex h-17 flex-col items-start justify-between">
                <span className="shrink-0 text-xs font-medium text-white/80 drop-shadow">
                  {STATUS_LABELS[entry.list_status] ?? entry.list_status}
                </span>
                {/* Two lines at most — `h-17` above is what that second line
                is budgeted against. */}
                <h3 className="line-clamp-2 text-balance font-display text-xl font-semibold leading-tight text-white drop-shadow">
                  {title.title}
                </h3>
              </div>

              {/* The source chips, standing where the reference runs its
              icon-heavy bed/bath/sqft row. `flex-nowrap` + `overflow-hidden`:
              on a narrow card a pill is clipped rather than wrapped onto a
              line that would push the strip off the art. */}
              <div className="flex flex-nowrap items-center gap-1 overflow-hidden pt-1">
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
                  <span className="shrink-0 rounded-badge bg-white/20 px-1 text-xs font-bold text-white backdrop-blur-sm">
                    +{overflow}
                  </span>
                ) : null}
              </div>

              {/* The stat strip. No ground of its own: the masked blur behind
              the whole stack already lifts it off the artwork, and a second
              translucent panel on top of that read as a smudge. */}
              <div className="grid grid-cols-2 divide-x divide-white/20 rounded-md pt-1 text-center">
                <div className="px-1 py-1">
                  <p className="text-xs leading-none text-white/70">Read</p>
                  <p className="mt-0.5 truncate text-sm font-bold leading-none whitespace-nowrap text-white tabular-nums">
                    {progressLabel(entry.num_chapters_read, total)}
                  </p>
                </div>
                <div className="px-1 py-1">
                  <p className="text-xs leading-none text-white/70">Left</p>
                  <p className="mt-0.5 truncate text-sm font-bold leading-none whitespace-nowrap text-white tabular-nums">
                    {/* What is left to read. Unknown when the total is. */}
                    {total && total > 0
                      ? Math.max(0, total - entry.num_chapters_read)
                      : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* The bar, along the card's bottom edge.

            A series with no known total has no percentage to draw, but the
            empty track still renders so every card ends on the same line. Only
            the fill is conditional, and without one the element is decorative,
            so it drops the progressbar role rather than reporting a
            meaningless 0%. */}
            {total && total > 0 ? (
              <div
                className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-white/20"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${pct}% read`}
              >
                <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
            ) : (
              <div
                className="absolute inset-x-0 bottom-0 h-1 bg-white/20"
                aria-hidden
              />
            )}
          </Link>

          {/* The corner controls, in one cluster opposite the status badges
          rather than over the title.

          Both overlay cover art, so every pixel they grow is artwork they
          hide — the read link is sized for a finger on touch and left alone on
          a pointer, and the ⋯ button exists only on touch. */}
          <div className="absolute right-2 top-2 flex flex-col items-center gap-1">
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
