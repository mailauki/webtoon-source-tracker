import { CoverImage } from "@/components/cover-image";
import {
  HiatusBadge,
  NoSourceBadge,
  OwnedBadge,
  SourceBadge,
} from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import { ownsEveryChapter } from "@/lib/data/chapter-ranges";
import { chapterTotal } from "@/lib/data/chapter-totals";
import { displayTitle, secondaryTitle } from "@/lib/data/display-title";
import type { EntryDetail } from "@/lib/data/entries";
import { progressLabel, statusLabel } from "@/lib/data/entry-labels";

/**
 * The entry page's own header: the shelf row, at detail scale.
 *
 * It is the same object the library list draws — cover at the leading edge,
 * the title block beside it, a divided stat strip trailing — so arriving here
 * from a row reads as that row opening up rather than as a different page
 * about the same title. What it adds is everything a card has no room for and
 * a detail page owes: the canonical title under the English one, the score,
 * the rereading flag, the media kind, every source rather than the first
 * three. The way out to each catalog lives in EntrySyncStatus below this,
 * which also says whether progress still travels there — and which, unlike a
 * bare link, copes with a title MyAnimeList does not have.
 *
 * Deliberately NOT the shared EntryCard in `row` layout. Three things differ
 * and all three matter: this is a Server Component (the card is a client one,
 * for its menu and sheet), it links nowhere (it IS the page the row links to,
 * and a card that links to itself is a trap), and `EntryDetail` is a
 * different query from `LibraryRow` — no `created_at`, no `nsfw`. Forcing
 * them together would mean a card that takes a link-or-not flag and a view
 * model with holes in it, to save markup that is mostly the extra fields this
 * one has.
 *
 * What it does share is the vocabulary: the same badges, the same
 * `progressLabel`, the same stat-strip shape. Those are the things that would
 * actually read as inconsistent if they drifted.
 */
export function EntryHeader({
  entry,
  children,
}: {
  entry: EntryDetail;
  /** The tag row, which is interactive and so cannot be built here. */
  children?: React.ReactNode;
}) {
  const title = entry.media_titles;
  // The heading takes the English name where MAL has one; `alsoKnownAs` is
  // the canonical one, and is null when it would only repeat the heading.
  // This page is the one surface with room for both.
  const name = displayTitle(title);
  const alsoKnownAs = secondaryTitle(title);

  const sources = entry.entry_sources;
  // Primary first, matching every other surface — the crown should never be
  // the pill that wrapped to the second line.
  const ordered = [...sources].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );

  // Every source has paused. See isOnHiatus — inlined rather than imported
  // because that helper takes a LibraryRow, and this page has an EntryDetail.
  const onHiatus = sources.length > 0 && sources.every((es) => es.is_hiatus);
  const ownedOutright = ownsEveryChapter(sources, chapterTotal(title));

  const total = title.num_chapters;
  const pct =
    total && total > 0
      ? Math.min(100, Math.round((entry.num_chapters_read / total) * 100))
      : null;

  return (
    // The row's shape at detail scale: stacked on a phone, where a 160px
    // cover beside text leaves the text nothing, and side by side from `sm`.
    <div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card sm:flex-row sm:items-stretch sm:gap-5">
      {/* Full-bleed at the leading edge, like the row's thumbnail — the cover
      runs to the card's edge rather than floating inside padding. */}
      <div className="relative aspect-[2/1] w-full shrink-0 overflow-hidden bg-muted sm:aspect-auto sm:w-40">
        <CoverImage
          src={title.main_picture_url}
          title={name}
          sizes="(max-width: 640px) 100vw, 160px"
          // `object-top` for the same reason the grid card uses it: a webtoon
          // cover puts the logo and the face up top, and the phone crop here
          // is severe.
          className="object-cover object-top"
          preload
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 px-4 pb-4 sm:py-4 sm:pl-0 sm:pr-5">
        <div className="grid gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold">{name}</h1>
            {/* The same three the row carries, in the same order. */}
            {sources.length === 0 ? <NoSourceBadge /> : null}
            {onHiatus ? <HiatusBadge /> : null}
            {ownedOutright ? <OwnedBadge /> : null}
          </div>
          {alsoKnownAs ? (
            <p className="text-sm text-muted-foreground">{alsoKnownAs}</p>
          ) : null}
        </div>

        {/* TODO(authors): the title's author is not shown, because it is not
            synced — so "more from this author" has nowhere to hang. See
            TODO.md for why the storage shape is the decision, and why the
            local catalog alone cannot answer the question honestly. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-pill">
            {statusLabel(entry.list_status)}
          </Badge>
          {title.mal_media_kind ? (
            <Badge variant="outline" className="rounded-pill capitalize">
              {title.mal_media_kind.replace("_", " ")}
            </Badge>
          ) : null}
          {entry.score > 0 ? (
            <Badge variant="outline" className="rounded-pill">
              Scored {entry.score}/10
            </Badge>
          ) : null}
          {entry.is_rereading ? (
            <Badge variant="outline" className="rounded-pill">
              Rereading
            </Badge>
          ) : null}
        </div>

        {/* Every source, where a card shows the first two or three and counts
        the rest. This is the page that has the room, and "where do I read
        this" is the question it exists to answer. */}
        {ordered.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {ordered.map((es) =>
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
          </div>
        ) : null}

        {children}

        {/* The stat strip, as a row draws it: divided cells, tabular figures.
        Three cells rather than the row's two — this page has the width, and
        volumes are a fact the shelf has no room for. */}
        <div className="flex w-fit items-stretch divide-x divide-border rounded-md border border-border bg-muted/50 text-center">
          <div className="px-3 py-1.5">
            <p className="text-[10px] leading-none text-muted-foreground">
              Chapters
            </p>
            <p className="mt-1 text-sm font-bold leading-none tabular-nums">
              {progressLabel(entry.num_chapters_read, total)}
            </p>
          </div>
          <div className="px-3 py-1.5">
            <p className="text-[10px] leading-none text-muted-foreground">
              Progress
            </p>
            <p className="mt-1 text-sm font-bold leading-none tabular-nums">
              {/* No known total means no percentage to report — an ongoing
              series would otherwise read as a confident 0%. */}
              {pct !== null ? `${pct}%` : "—"}
            </p>
          </div>
          {/* Only when MAL knows of any: a volume count of nothing is not a
          fact worth a third of the strip. */}
          {title.num_volumes && title.num_volumes > 0 ? (
            <div className="px-3 py-1.5">
              <p className="text-[10px] leading-none text-muted-foreground">
                Volumes
              </p>
              <p className="mt-1 text-sm font-bold leading-none tabular-nums">
                {progressLabel(entry.num_volumes_read, title.num_volumes)}
              </p>
            </div>
          ) : null}
        </div>

        {/* The bar, under the strip it belongs to. Only drawn when there is a
        total to divide by. */}
        {pct !== null ? (
          <div
            className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted"
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
    </div>
  );
}
