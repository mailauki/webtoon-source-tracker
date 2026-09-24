import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AniListLinkImport } from "@/components/anilist-link-import";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EntryCollections } from "@/components/entry-collections";
import { EntryHeader } from "@/components/entry-header";
import { EntryRemove } from "@/components/entry-remove";
import { EntrySyncStatus } from "@/components/entry-sync-status";
import { EntrySourceEditor } from "@/components/entry-source-editor";
import { EntryTags } from "@/components/entry-tags";
import { ProgressEditor } from "@/components/progress-editor";
import { getMediaExtras } from "@/lib/anilist/endpoints";
import type { AniListMediaExtras } from "@/lib/anilist/types";
import { getChapterCount } from "@/lib/mal/endpoints";
import { isAdmin, verifySession } from "@/lib/auth/dal";
import {
  catalogLinks,
  chapterDifference,
  higherChapterCount,
  suggestSourceLinks,
} from "@/lib/data/anilist-links";
import { chapterTotal } from "@/lib/data/chapter-totals";
import { displayTitle } from "@/lib/data/display-title";
import { getCollectionTargets } from "@/lib/data/collections";
import { getEntry, type EntryDetail } from "@/lib/data/entries";
import { getSources } from "@/lib/data/sources";
import { getActiveTags, getTagsForTitle } from "@/lib/data/tags";

export async function generateMetadata({ params }: PageProps<"/entry/[id]">) {
  const { id } = await params;
  const entry = await getEntry(Number(id));
  return {
    title: entry ? displayTitle(entry.media_titles) : "Not found",
  };
}

export default async function EntryPage({ params }: PageProps<"/entry/[id]">) {
  await verifySession();

  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId <= 0) notFound();

  // isAdmin() is called here and only here: the spec deliberately avoids an
  // admin check on every page render (AppShell included), so this is the one
  // place — the reader's own entry page — that asks.
  const [entry, catalog, collections, admin] = await Promise.all([
    getEntry(entryId),
    getSources(),
    // withItemIds: this page can take a title back out of a collection, and
    // removing needs the collection_items id.
    getCollectionTargets({ withItemIds: true }),
    isAdmin(),
  ]);

  // RLS makes "does not exist" and "belongs to someone else" indistinguishable
  // here, which is what we want: both 404 rather than confirming existence.
  if (!entry) notFound();

  // The header owns every derived display value now — both names, the
  // progress percentage, the badges. This page keeps only what the sections
  // below it need.
  const title = entry.media_titles;

  // Not awaited: both AniList sections below stream in behind Suspense, so a
  // slow or unreachable AniList costs those two hints and never the page.
  const anilist = getMediaExtras({
    anilistMediaId: title.anilist_media_id,
    malMediaId: title.mal_media_id,
  });
  // Live from MAL, falling back to the synced count if MAL is unreachable.
  // Null for an AniList-only title, which has no MAL count to read.
  const malChapters =
    title.mal_media_id === null
      ? Promise.resolve(null)
      : getChapterCount(title.mal_media_id).then(
          (live) => live ?? title.num_chapters,
        );

  // allTags is only fetched for an admin — a reader never sees the picker, so
  // there is nothing for the full tag vocabulary to do on their render.
  const [tags, allTags] = await Promise.all([
    getTagsForTitle(title.id),
    admin ? getActiveTags() : Promise.resolve([]),
  ]);

  return (
    <AppShell
      // Sticky under the header, like the library's status chips: the way back
      // stays one tap away however far down the page the reader is. The row
      // paints nothing of its own; the ghost button picks up its translucent,
      // blurred ground from the chrome it sits in, rather than sitting flat
      // over the content scrolling beneath it.
      secondaryRow={
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="rounded-pill text-muted-foreground">
            <Link href="/library">
              <ArrowLeft data-icon="inline-start" />
              Back to library
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-8">
        <EntryHeader entry={entry}>
          <EntryTags
            titleId={title.id}
            tags={tags}
            allTags={allTags}
            isAdmin={admin}
          />
        </EntryHeader>

        {/* Below the header rather than inside it: EntryHeader is the shelf
            row at detail scale, and this is not something a row has. It also
            replaces the header's own "View on MyAnimeList" link, which builds
            a URL from `mal_media_id` unconditionally — that is null for a
            title only AniList has, so the link would point at /manga/null. */}
        <EntrySyncStatus
          malMediaId={title.mal_media_id}
          anilistMediaId={title.anilist_media_id}
          syncToMal={entry.sync_to_mal}
          syncToAniList={entry.sync_to_anilist}
          archived={entry.archived_at !== null}
        />

        {/* Only for a MAL-backed title: an AniList-only row's num_chapters
            already came from AniList, so there is nothing to compare. */}
        {title.mal_media_id !== null ? (
          <Suspense fallback={null}>
            <ChapterCheck extras={anilist} malChapters={malChapters} />
          </Suspense>
        ) : null}

        {/* The stored count first, swapped for the higher of the two sites'
            once both have answered. */}
        <Suspense fallback={<ProgressEditor entry={entry} />}>
          <ProgressWithTotal
            entry={entry}
            extras={anilist}
            malChapters={malChapters}
          />
        </Suspense>

        {/* Without AniList's links first, then with them once AniList has
            answered — the editor works either way. */}
        <Suspense
          fallback={
            <EntrySourceEditor
              entryId={entry.id}
              sources={entry.entry_sources}
              catalog={catalog}
              total={chapterTotal(title)}
            />
          }
        >
          <SourceEditorWithLinks
            extras={anilist}
            entryId={entry.id}
            sources={entry.entry_sources}
            catalog={catalog}
            total={chapterTotal(title)}
          />
        </Suspense>

        <Suspense fallback={null}>
          <AniListLinks
            extras={anilist}
            entryId={entry.id}
            attached={entry.entry_sources}
          />
        </Suspense>

        {/* Below the sources: where you read a title is the point of the app,
            and which lists you filed it under is the lighter question. */}
        <EntryCollections titleId={title.id} collections={collections} />

        {/* Last on the page, and visually quiet: this is the one action here
            that can reach past the app and change a list on another site. */}
        <EntryRemove
          entryId={entry.id}
          title={displayTitle(title)}
          onMal={title.mal_media_id !== null}
          onAniList={title.anilist_media_id !== null}
          archived={entry.archived_at !== null}
        />
      </div>
    </AppShell>
  );
}

/** Where MyAnimeList's chapter count and AniList's disagree. */
async function ChapterCheck({
  extras,
  malChapters,
}: {
  extras: Promise<AniListMediaExtras | null>;
  malChapters: Promise<number | null>;
}) {
  const [media, mal] = await Promise.all([extras, malChapters]);
  // No AniList answer means nothing to compare against, not a difference.
  const difference = media ? chapterDifference(mal, media.chapters) : null;
  if (!difference) return null;

  return (
    <div role="status" className="grid gap-1 rounded-xl border border-alert/40 p-3">
      <h2 className="text-sm font-semibold">Chapter counts differ</h2>
      <p className="text-sm text-muted-foreground">{difference}</p>
    </div>
  );
}

/** AniList's reading links, offered as URLs for the sources already attached. */
async function AniListLinks({
  extras,
  entryId,
  attached,
}: {
  extras: Promise<AniListMediaExtras | null>;
  entryId: number;
  attached: Parameters<typeof suggestSourceLinks>[1];
}) {
  const media = await extras;
  if (!media) return null;

  return (
    <AniListLinkImport
      entryId={entryId}
      suggestions={suggestSourceLinks(media.externalLinks, attached)}
    />
  );
}

/** The progress editor, counting up to the higher of the two sites' counts. */
async function ProgressWithTotal({
  entry,
  extras,
  malChapters,
}: {
  entry: EntryDetail;
  extras: Promise<AniListMediaExtras | null>;
  malChapters: Promise<number | null>;
}) {
  const [media, mal] = await Promise.all([extras, malChapters]);

  return (
    <ProgressEditor
      entry={entry}
      total={higherChapterCount(
        entry.media_titles.num_chapters,
        mal,
        media?.chapters,
      )}
    />
  );
}

/** The source editor, with AniList's link for each source it lists. */
async function SourceEditorWithLinks({
  extras,
  ...props
}: { extras: Promise<AniListMediaExtras | null> } & Omit<
  React.ComponentProps<typeof EntrySourceEditor>,
  "anilistLinks"
>) {
  const media = await extras;

  return (
    <EntrySourceEditor
      {...props}
      anilistLinks={catalogLinks(media?.externalLinks, props.catalog)}
    />
  );
}
