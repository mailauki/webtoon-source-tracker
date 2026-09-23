"use client";

import Link from "next/link";
import { forwardRef, useState } from "react";
import { Ellipsis, ExternalLink } from "lucide-react";

import { CoverImage } from "@/components/cover-image";
import { AddTitleButton } from "@/components/add-title-button";
import { RemoveFromCollectionButton } from "@/components/remove-from-collection-button";
import {
  EntryCardMenu,
  type SourceDialogRequest,
} from "@/components/entry-card-menu";
import { EntrySourceDialog } from "@/components/entry-source-dialog";
import {
  HiatusBadge,
  MatureBadge,
  NoSourceBadge,
  OwnedBadge,
  SourceBadge,
  TrackedBadge,
} from "@/components/source-badge";
import { EntryCardSheet } from "@/components/entry-card-sheet";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { LibraryRow } from "@/lib/data/entries";
import { progressLabel, statusLabel } from "@/lib/data/entry-labels";
import { entryView, type EntryView } from "@/lib/data/entry-view";
import type { RankedSource, Source } from "@/lib/data/rank-sources";

/**
 * How one title is drawn.
 *
 * `grid` is the overlay card — the art IS the card, with everything lettered
 * over it. `row` is the same vocabulary laid on its side for a list: a
 * thumbnail at the leading edge, the text in the middle, the stats trailing.
 */
export type EntryLayout = "grid" | "row";

/**
 * One title, from either side of the app, in either layout.
 *
 * This is the single card. It used to be three components — EntryCard for the
 * library grid, EntryRow for a list view that nothing rendered, and
 * CollectionCard for the discover and tag pages — which meant three cover
 * treatments and three sets of badges drifting apart one fix at a time.
 *
 * The two axes are independent, and keeping them that way is the point:
 *
 *   - `layout` is how it is drawn, and the caller decides (a grid or a list).
 *   - `view.entry` is what there is to draw, and the data decides. A title the
 *     viewer tracks has a status, progress and sources; a catalog title on a
 *     curated shelf has none of those and offers to be added instead.
 *
 * So a curated shelf gets row layout for free, and the library's list view
 * shows the same badges its cards do. See lib/data/entry-view.ts for the
 * normalisation both shapes go through.
 *
 * Every behaviour is identical across layouts — same entry link, same
 * read-through link, same right-click menu, same touch sheet, same dialog. A
 * row is a different shape for the same title, not a different set of things
 * you can do to it.
 */
export function EntryCard({
  entry: row,
  view: given,
  layout = "grid",
  topSources = [],
  catalog = [],
  removable,
}: {
  /**
   * A library row, for the shelf and the search page. Normalised here rather
   * than at each call site: those two callers have a `LibraryRow` in hand and
   * nothing else to say about it.
   */
  entry?: LibraryRow;
  /**
   * A pre-built view, for a caller whose data is not a library row — the
   * collection and tag pages, which have a catalog title and a maybe-entry
   * id. Exactly one of this and `entry` is passed.
   */
  view?: EntryView;
  layout?: EntryLayout;
  topSources?: RankedSource[];
  catalog?: Source[];
  /**
   * Turns the card into an editable one, for a collection the viewer owns.
   * Carries the ids rather than a callback: a Server Component renders these,
   * and a function prop across that boundary throws at runtime.
   */
  removable?: { collectionId: number; itemId: number };
}) {
  // Both live outside <ContextMenuContent> — Radix unmounts menu content on
  // close and would take them with it.
  const [dialog, setDialog] = useState<SourceDialogRequest | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Exactly one of the two is always passed. Not modelled as a union of two
  // prop shapes: that costs every call site its inference to catch a mistake
  // no caller is in a position to make, since which prop to pass follows from
  // what the page fetched.
  const view = given ?? entryView(row!);
  const { name, entry } = view;
  const body =
    layout === "row" ? (
      <EntryRowBody
        view={view}
        removable={removable}
        onOpenSheet={() => setSheetOpen(true)}
      />
    ) : (
      <EntryGridBody
        view={view}
        removable={removable}
        onOpenSheet={() => setSheetOpen(true)}
      />
    );

  // Nothing tracked means nothing to act on: the menu, the sheet and the
  // source dialog all edit an entry that does not exist yet. The card stands
  // alone, with its Add button as the only action.
  if (!entry) return body;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>

      <EntryCardMenu
        entry={entry.row}
        topSources={topSources}
        onOpenDialog={setDialog}
      />

      {/* Both sit outside <ContextMenuContent>: Radix unmounts menu content on
      close and would take them with it. */}
      <EntryCardSheet
        entry={entry.row}
        entryTitle={name}
        topSources={topSources}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onOpenDialog={setDialog}
      />

      <EntrySourceDialog
        entryId={entry.id}
        entryTitle={name}
        request={dialog}
        attached={entry.sources}
        catalog={catalog}
        // The row already carries MAL's count, so the quick-edit dialog can
        // offer the same "own all" shortcut the entry page does.
        total={view.malTotal}
        onClose={() => setDialog(null)}
      />
    </ContextMenu>
  );
}

/* ------------------------------------------------------------------------ */
/* The corner / trailing controls, shared by both layouts                   */
/* ------------------------------------------------------------------------ */

/**
 * The read-through link and the ⋯ button, as one cluster.
 *
 * Both overlay the card, so every pixel they grow is artwork they hide — the
 * read link is sized for a finger on touch and left alone on a pointer, and
 * the ⋯ button exists only on touch.
 *
 * The ⋯ is visible on touch, and on a mouse only once focused. A pointer
 * reaches these actions by right-clicking the card, so a button sitting there
 * permanently would be clutter over the artwork. But `hidden` would take it
 * out of the tab order too, and a keyboard has no right-click — leaving
 * Shift+F10 as the only way in. `sr-only` keeps it reachable by Tab and
 * announced by a screen reader while showing nothing, and focus brings it back
 * into view so a sighted keyboard user can see where they are.
 *
 * Gated by media query rather than by measuring the pointer in JS, which keeps
 * it out of the hydration path — no pop-in on the first paint of a phone.
 */
function CardControls({
  view,
  onOpenSheet,
  overlay,
}: {
  view: EntryView;
  onOpenSheet: () => void;
  /** Frosted dark for cover art; theme surfaces for the row's solid ground. */
  overlay: boolean;
}) {
  const entry = view.entry;
  if (!entry) return null;

  const readAt = entry.readAt;
  const skin = overlay
    ? "bg-slate-900/70 text-white backdrop-blur-sm hover:bg-slate-900/90"
    : "bg-secondary text-secondary-foreground hover:bg-secondary/80";
  const ring =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <>
      {/* The card owns the tap; this owns the read. Always visible: on touch
      there is no hover to reveal it, and "where do I read this" is the
      question the shelf exists to answer.

      Only the primary source gets a button. The rest are in the menu, which
      is the surface built for the full list. */}
      {readAt ? (
        <a
          href={readAt.url!}
          target="_blank"
          rel="noopener noreferrer"
          title={`Read on ${readAt.sources!.name}`}
          aria-label={`Read ${view.name} on ${readAt.sources!.name}`}
          className={`inline-flex items-center justify-center rounded-full transition-colors ${skin} ${ring} ${
            overlay
              ? "size-7 pointer-coarse:size-10 pointer-coarse:[&_svg]:size-5"
              : "size-8 pointer-coarse:size-10"
          }`}
        >
          <ExternalLink className={overlay ? "size-3.5" : "size-4"} />
        </a>
      ) : null}

      <button
        type="button"
        onClick={onOpenSheet}
        aria-label={`Actions for ${view.name}`}
        className={`inline-flex size-10 items-center justify-center rounded-full transition-colors ${skin} ${ring} pointer-fine:sr-only pointer-fine:focus-visible:not-sr-only`}
      >
        <Ellipsis className="size-5" />
      </button>
    </>
  );
}

/**
 * The link wrapper, or a plain div when there is nowhere to go.
 *
 * An untracked catalog title has no entry page — the Add button below the
 * cover is the whole point of that card — so it renders unwrapped rather than
 * as a dead link.
 */
function CardLink({
  href,
  name,
  className,
  children,
}: {
  href: string | null;
  name: string;
  className: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;

  return (
    <Link
      href={href}
      // Labelled with the title alone. Without it the accessible name is
      // everything inside — cover alt, badges, status, progress — read out as
      // one run-on string.
      aria-label={name}
      className={className}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------------ */
/* Grid                                                                      */
/* ------------------------------------------------------------------------ */

const EntryGridBody = forwardRef<
  HTMLDivElement,
  {
    view: EntryView;
    removable?: { collectionId: number; itemId: number };
    onOpenSheet: () => void;
  } & React.ComponentPropsWithoutRef<"div">
>(function EntryGridBody({ view, removable, onOpenSheet, ...trigger }, ref) {
  const { name, entry, total } = view;

  return (
    /* The corner controls cannot live inside the card link: the parser hoists
    a nested anchor out of its parent, so the server markup and the client tree
    disagree and hydration fails. They sit side by side under this wrapper
    instead, which is what the cover's hover zoom keys off, what the corner
    controls position against, and what right-click triggers the menu from.

    `...trigger` and the ref are what <ContextMenuTrigger asChild> injects.
    Radix clones its single child, so those land on this component rather than
    on an element — without spreading them through, right-click reaches no
    handler and the menu never opens. */
    <div className="group/card relative" ref={ref} {...trigger}>
      <CardLink
        href={view.entryHref}
        name={name}
        // Overlay style: the art IS the card. Everything — title, chips,
        // stats — sits on top of it, so the frame is just a clipping boundary
        // with a radius rather than a surface of its own.
        className="group relative block overflow-hidden rounded-xl bg-muted shadow-sm ring-offset-background transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* 9/16 portrait — taller than it is wide, close to the ~2:3 MAL
        covers already come in, so object-cover barely has to crop. The overlay
        rows stack up the lower third rather than across. */}
        <div className="relative aspect-[9/16] overflow-hidden">
          <CoverImage
            src={view.coverUrl}
            title={name}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
            // `object-top` so what little a 9/16 window crops off a ~2:3 cover
            // comes off the bottom: webtoon covers put the title logo and the
            // character's face up top.
            className="object-cover object-top transition-transform duration-200 group-hover/card:scale-105"
          />

          {/* Two layers, because white text over unknown artwork needs both.
          The gradient darkens; the blur, faded in from its own midpoint by the
          mask, kills the high-frequency detail that would otherwise fight the
          text. A gradient heavy enough to beat busy art on its own buried the
          cover. */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-60 backdrop-blur-lg mask-t-from-50%" />
        </div>

        {/* Status badges, top-left. */}
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 p-2">
          {entry && entry.sources.length === 0 ? <NoSourceBadge overlay /> : null}
          {entry?.onHiatus ? <HiatusBadge overlay /> : null}
          {/* Last of the three, so the states that need acting on — nothing
              recorded, or nothing updating — stay leftmost. Owning something
              is settled news. */}
          {entry?.ownedOutright ? <OwnedBadge overlay /> : null}
          {/* Only on a discover shelf: this is the card's answer to "do I
              have this already", and it is what the Add button below is
              replaced by. A library card is tracked by definition. */}
          {!entry && view.entryHref ? <TrackedBadge overlay /> : null}
          {/* Rightmost: a rating is the least actionable of the four. */}
          {view.mature ? <MatureBadge overlay /> : null}
        </div>

        {/* The content stack, bottom-anchored over the art: status and title,
        then the chips, then the stat strip. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col p-2 pb-3.5">
          {/* Status over title, in a fixed-height block so the chips and the
          strip below start on the same line whether a title runs to one line
          or two. An untracked title has no status, but keeps the block so a
          mixed shelf still lines up. */}
          <div className="flex h-17 flex-col items-start justify-between">
            <span className="shrink-0 text-xs font-medium text-white/80 drop-shadow">
              {entry ? statusLabel(entry.listStatus) : ""}
            </span>
            {/* Two lines at most — `h-17` above is what that second line is
            budgeted against. */}
            <h3 className="line-clamp-2 text-balance font-display text-xl font-semibold leading-tight text-white drop-shadow">
              {name}
            </h3>
          </div>

          {entry ? <GridChips entry={entry} /> : null}
          {entry ? <GridStats entry={entry} total={total} /> : null}
        </div>
      </CardLink>

      <ProgressRail pct={entry?.pct ?? null} />

      {/* The corner controls, in one cluster opposite the status badges rather
      than over the title.

      `flex-col-reverse` puts the ⋯ button on top visually while leaving the
      read link first in the DOM — reading is the common action, so it keeps
      the first tab stop and is announced first. */}
      <div className="absolute right-2 top-2 flex flex-col-reverse items-center gap-1">
        <CardControls view={view} onOpenSheet={onOpenSheet} overlay />
      </div>

      {/* Sits outside the link above: a nested anchor/button would be hoisted
      out by the HTML parser and break hydration. Always rendered rather than
      revealed on hover, since a touch device has no hover. */}
      {removable ? (
        <div className="absolute right-1.5 top-1.5">
          <RemoveFromCollectionButton
            itemId={removable.itemId}
            collectionId={removable.collectionId}
            name={name}
          />
        </div>
      ) : null}

      <CardFooter view={view} />
    </div>
  );
});

/**
 * The source chips, standing where a listing's spec row would.
 *
 * `flex-nowrap` keeps them on one line: a second line here would push the
 * strip off the art.
 *
 * The pills may shrink past their content — `min-w-0` plus the `truncate`
 * below override the badge's own `shrink-0` and `nowrap`. Two chips at
 * `text-xs` are wider than a card in a 2-up grid, and a name ellipsised inside
 * a whole pill reads as a long name, where a pill sliced off mid-word by the
 * container just looks broken.
 */
function GridChips({ entry }: { entry: NonNullable<EntryView["entry"]> }) {
  const visible = entry.sources.slice(0, 2);
  const overflow = entry.sources.length - visible.length;

  return (
    <div className="flex flex-nowrap items-center gap-1 overflow-hidden pt-1">
      {visible.map((es) =>
        es.sources ? (
          <SourceBadge
            key={es.id}
            overlay
            className="min-w-0 shrink [&>span]:truncate"
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
  );
}

/**
 * The stat strip. No ground of its own: the masked blur behind the whole stack
 * already lifts it off the artwork, and a second translucent panel on top of
 * that read as a smudge.
 */
function GridStats({
  entry,
  total,
}: {
  entry: NonNullable<EntryView["entry"]>;
  total: number | null;
}) {
  return (
    <div className="grid grid-cols-2 divide-x divide-white/20 rounded-md pt-1 text-center">
      <div className="px-1 py-1">
        <p className="text-xs leading-none text-white/70">Read</p>
        <p className="mt-0.5 truncate text-sm font-bold leading-none whitespace-nowrap text-white tabular-nums">
          {progressLabel(entry.chaptersRead, total)}
        </p>
      </div>
      <div className="px-1 py-1">
        <p className="text-xs leading-none text-white/70">Left</p>
        <p className="mt-0.5 truncate text-sm font-bold leading-none whitespace-nowrap text-white tabular-nums">
          {/* What is left to read. Unknown when the total is. */}
          {entry.remaining ?? "—"}
        </p>
      </div>
    </div>
  );
}

/**
 * The bar along the card's bottom edge.
 *
 * A series with no known total has no percentage to draw, but the empty track
 * still renders so every card ends on the same line. Only the fill is
 * conditional, and without one the element is decorative, so it drops the
 * progressbar role rather than reporting a meaningless 0%.
 */
function ProgressRail({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden />
    );
  }

  return (
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
  );
}

/* ------------------------------------------------------------------------ */
/* Row                                                                       */
/* ------------------------------------------------------------------------ */

const EntryRowBody = forwardRef<
  HTMLDivElement,
  {
    view: EntryView;
    removable?: { collectionId: number; itemId: number };
    onOpenSheet: () => void;
  } & React.ComponentPropsWithoutRef<"div">
>(function EntryRowBody({ view, removable, onOpenSheet, ...trigger }, ref) {
  const { name, entry, total } = view;
  const visible = entry?.sources.slice(0, 3) ?? [];
  const overflow = (entry?.sources.length ?? 0) - visible.length;

  return (
    /* Same wrapper split as the grid: the trailing controls are anchors and
    buttons, and nesting an anchor inside the row link would be hoisted out by
    the parser and break hydration. `...trigger` and the ref come from
    <ContextMenuTrigger asChild> — see EntryGridBody. */
    <div className="group/row relative" ref={ref} {...trigger}>
      <CardLink
        href={view.entryHref}
        name={name}
        // `pr-24` keeps the text clear of the controls parked on the right.
        className="group flex items-stretch gap-3 overflow-hidden rounded-xl border border-border bg-card pr-24 shadow-sm ring-offset-background transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* A portrait thumbnail at the leading edge. Fixed width so every
        row's text starts on the same line however tall the row grows. */}
        <div className="relative w-16 shrink-0 self-stretch overflow-hidden bg-muted">
          <CoverImage
            src={view.coverUrl}
            title={name}
            sizes="64px"
            className="object-cover transition-transform duration-200 group-hover/row:scale-105"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="truncate font-display text-sm font-bold leading-tight">
              {name}
            </h3>
            {/* Inline with the title rather than over artwork, so these take
            their on-page treatment — `overlay` is for cover art. */}
            {entry && entry.sources.length === 0 ? <NoSourceBadge /> : null}
            {entry?.onHiatus ? <HiatusBadge /> : null}
            {entry?.ownedOutright ? <OwnedBadge /> : null}
            {!entry && view.entryHref ? <TrackedBadge /> : null}
            {view.mature ? <MatureBadge /> : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {entry ? (
              <span className="text-[11px] text-muted-foreground">
                {statusLabel(entry.listStatus)}
              </span>
            ) : null}
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
              <span className="rounded-pill bg-secondary px-2 text-xs font-semibold text-secondary-foreground">
                +{overflow}
              </span>
            ) : null}
            {/* The editorial line a curated shelf adds, where the status
            would otherwise sit. It is what makes a curated shelf curated
            rather than a filtered list. */}
            {!entry && view.note ? (
              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                {view.note}
              </p>
            ) : null}
          </div>

          {/* The progress bar sits under the text rather than along the row's
          edge: a row is short enough that a hairline on the border would read
          as part of the border. Only drawn when there is a total to divide
          by. */}
          {entry && entry.pct !== null ? (
            <div
              className="h-1 w-full max-w-48 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={entry.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${entry.pct}% read`}
            >
              <div
                className="h-full bg-brand"
                style={{ width: `${entry.pct}%` }}
              />
            </div>
          ) : null}
        </div>

        {/* The stat strip, turned on its side: the grid's divided cells as
        columns at the trailing edge. Hidden on a phone, where the row has no
        width to spare — the title and chips are what matter there, and the
        numbers are one tap away on the entry page. */}
        {entry ? (
          <div className="hidden shrink-0 items-stretch divide-x divide-border border-l border-border bg-muted/50 text-center sm:flex">
            <div className="flex w-20 flex-col justify-center px-2 py-1.5">
              <p className="text-[9px] leading-none text-muted-foreground">
                Read
              </p>
              <p className="mt-0.5 truncate text-[11px] font-bold leading-none whitespace-nowrap tabular-nums">
                {progressLabel(entry.chaptersRead, total)}
              </p>
            </div>
            <div className="flex w-16 flex-col justify-center px-2 py-1.5">
              <p className="text-[9px] leading-none text-muted-foreground">
                Progress
              </p>
              <p className="mt-0.5 text-[11px] font-bold leading-none tabular-nums">
                {/* No known total means no percentage to report — an ongoing
                series would otherwise read as a confident 0%. */}
                {entry.pct !== null ? `${entry.pct}%` : "—"}
              </p>
            </div>
          </div>
        ) : null}
      </CardLink>

      {/* Parked at the trailing edge, vertically centred. */}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <CardControls view={view} onOpenSheet={onOpenSheet} overlay={false} />
        {/* An untracked title's one action, sized to sit in the same slot the
        read link would. */}
        {/* No MyAnimeList id means no way to add it: addEntry writes to MAL
            first, so the button could only fail. Titles only AniList has are
            added from /search, which knows how to reach AniList. */}
        {!entry && !view.entryHref && view.malMediaId !== null ? (
          <AddTitleButton malMediaId={view.malMediaId} name={name} compact />
        ) : null}
        {removable ? (
          <RemoveFromCollectionButton
            itemId={removable.itemId}
            collectionId={removable.collectionId}
            name={name}
          />
        ) : null}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* Footer — the untracked card's Add button and its editorial line           */
/* ------------------------------------------------------------------------ */

/**
 * What hangs below a grid card that is not on the shelf yet.
 *
 * Only the untracked case has anything here: a tracked card says everything it
 * has to say over the artwork, and a footer under it would break the grid's
 * even rows for no gain.
 */
function CardFooter({ view }: { view: EntryView }) {
  // A library card says everything over its artwork. Only the collection
  // shapes — which carry a note, or nowhere to link — have a footer.
  if (view.entry) return null;
  if (!view.note && view.entryHref) return null;

  return (
    <div className="grid gap-1.5 pt-1.5">
      {/* The editorial line, when there is one. It is what makes a curated
      shelf curated rather than a filtered list, so it sits under every card
      that has one. */}
      {view.note ? (
        <p className="line-clamp-2 px-0.5 text-xs text-muted-foreground">
          {view.note}
        </p>
      ) : null}
      {view.entryHref || view.malMediaId === null ? null : (
        <AddTitleButton malMediaId={view.malMediaId} name={view.name} />
      )}
    </div>
  );
}
