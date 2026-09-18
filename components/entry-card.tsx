"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/**
 * Whether this click means "open it somewhere else" rather than "act here".
 *
 * The modifier combinations are what actually reach here — cmd on macOS, ctrl
 * elsewhere, shift for a new window. Middle-click dispatches `auxclick` rather
 * than `click` in current browsers, so the button check is insurance against
 * one that does not, and costs a comparison.
 */
function opensElsewhere(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

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
  // The dialog lives outside <DropdownMenu> — Radix unmounts menu content on
  // close and would take the dialog with it.
  const [dialog, setDialog] = useState<SourceDialogRequest | null>(null);

  // Controlled, so that opening is this component's decision rather than
  // Radix's. See `closeOnly` and the anchor's onClick below.
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * Accepts Radix's requests to *close*, and declines its requests to open.
   *
   * `DropdownMenuTrigger` opens from `pointerdown`, which on touch fires the
   * moment a finger lands — before the browser knows whether the gesture is a
   * tap or the start of a scroll. Scrolling the shelf therefore opened a menu
   * under the thumb on nearly every swipe.
   *
   * Opening moves to `click`, which the browser does not fire when a touch
   * turns into a scroll — so the distinction is made by the platform, with no
   * movement threshold of our own to tune. Every *close* still comes from
   * Radix: outside press, Escape, and selecting an item all route here.
   */
  function closeOnly(next: boolean) {
    if (!next) setMenuOpen(false);
  }

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
    // The read link cannot live inside the trigger: an anchor nested in a
    // button is invalid, the parser hoists it out, and the server markup then
    // disagrees with the client tree so hydration fails. The two sit side by
    // side under this wrapper instead, which is what the cover's hover zoom
    // keys off and what the read link positions against.
    <div className="group/card relative">
      <DropdownMenu open={menuOpen} onOpenChange={closeOnly}>
        <DropdownMenuTrigger asChild>
          {/* A real link that opens the menu on a completed click.

          Every gesture that means "open this somewhere else" is left to the
          browser: right-click gets the native menu, middle-click and the
          modifier combinations get a new tab or window. None of them produces
          a plain `click`, so none of them opens the menu — the check below is
          what keeps a cmd-click from doing both.

          A plain click is the reverse: the menu opens, so the navigation has
          to be cancelled or the card would do both.

          Keyboard opens it here too. Radix asks to toggle on Enter, Space and
          ArrowDown, but `closeOnly` declines every open it is asked for, so
          `onKeyDown` does it directly — Radix still cancels the navigation
          those keys would otherwise cause on an anchor.

          The href is real, which is the point — a card can be opened in a new
          tab, and its destination is visible in the status bar on hover. */}
          <a
            href={`/entry/${entry.id}`}
            onClick={(event) => {
              if (opensElsewhere(event)) return;
              event.preventDefault();
              setMenuOpen(true);
            }}
            onKeyDown={(event) => {
              if (["Enter", " ", "ArrowDown"].includes(event.key)) {
                setMenuOpen(true);
              }
            }}
            className="group block w-full text-left focus-visible:outline-none"
            aria-label={`${title.title} — open quick actions`}
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
          </a>
        </DropdownMenuTrigger>

        <EntryCardMenu
          entry={entry}
          topSources={topSources}
          onOpenDialog={setDialog}
        />
      </DropdownMenu>

      {/* The cover owns the tap; this owns the read. Both are on the card so
      neither needs the menu, and the button sits opposite the status badges
      rather than over the title. Always visible: on touch there is no hover to
      reveal it, and "where do I read this" is the question the shelf exists to
      answer.

      Sized for a finger on touch and left alone on a pointer — it overlays
      cover art, so every pixel it grows is artwork it hides.

      Only the primary source gets a button. The rest stay one tap away in the
      menu, which is the surface built for the full list. */}
      {readAt ? (
        <a
          href={readAt.url!}
          target="_blank"
          rel="noopener noreferrer"
          title={`Read on ${readAt.sources!.name}`}
          aria-label={`Read ${title.title} on ${readAt.sources!.name}`}
          className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur-sm transition-colors hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background pointer-coarse:size-10 pointer-coarse:[&_svg]:size-5"
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}

      {/* Outside the DropdownMenu: Radix unmounts menu content on close and
      would take the dialog with it. */}
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
    </div>
  );
}
