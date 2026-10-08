import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AniListLinkImport } from "@/components/anilist-link-import";
import { AppShell } from "@/components/app-shell";
import { EntryAuthorWorks } from "@/components/entry-author-works";
import { AuthorCheck, EntryAuthors } from "@/components/entry-authors";
import { Button } from "@/components/ui/button";
import { EntryCollections } from "@/components/entry-collections";
import { EntryHeader } from "@/components/entry-header";
import { EntryMalLink } from "@/components/entry-mal-link";
import { EntryRemove } from "@/components/entry-remove";
import { EntrySyncStatus } from "@/components/entry-sync-status";
import { EntrySourceEditor } from "@/components/entry-source-editor";
import { EntryTags } from "@/components/entry-tags";
import { PosterPicker } from "@/components/poster-picker";
import { ProgressEditor } from "@/components/progress-editor";
import { getMediaExtras } from "@/lib/anilist/endpoints";
import { malGenresFor } from "@/lib/anilist/genres";
import type { AniListMediaExtras } from "@/lib/anilist/types";
import { getMalLiveDetails, type MalLiveDetails } from "@/lib/mal/endpoints";
import { getPersonManga } from "@/lib/mal/jikan";
import {
  getAniListConnection,
  hidesMatureTitles,
  isAdmin,
  verifySession,
} from "@/lib/auth/dal";
import {
  catalogLinks,
  chapterDifference,
  higherChapterCount,
  suggestSourceLinks,
} from "@/lib/data/anilist-links";
import {
  authorWorks,
  mergeAuthors,
  relatedWorks,
  withMalWorks,
} from "@/lib/data/author-works";
import { chapterTotal } from "@/lib/data/chapter-totals";
import { displayTitle } from "@/lib/data/display-title";
import { posterOptions } from "@/lib/data/entry-cover";
import { getCollectionTargets } from "@/lib/data/collections";
import {
  getEntry,
  getLibraryMatches,
  type EntryDetail,
} from "@/lib/data/entries";
import { getIsPro } from "@/lib/data/pro";
import { getSources } from "@/lib/data/sources";
import { mergeTags, type Tag } from "@/lib/data/tag-items";
import {
  getActiveTags,
  getTagsForMalGenres,
  getTagsForTitle,
} from "@/lib/data/tags";

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
  const [entry, catalog, collections, admin, isPro] = await Promise.all([
    getEntry(entryId),
    getSources(),
    // withItemIds: this page can take a title back out of a collection, and
    // removing needs the collection_items id.
    getCollectionTargets({ withItemIds: true }),
    isAdmin(),
    getIsPro(),
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
  // With Pro, the same request also carries each author's other works — one
  // round trip to AniList either way.
  const anilist = getMediaExtras({
    anilistMediaId: title.anilist_media_id,
    malMediaId: title.mal_media_id,
    withWorks: isPro,
  });
  // Live from MAL in one request: the chapter count, falling back to the
  // synced one if MAL is unreachable, the genres merged into the tags, and
  // the authors lined up against AniList's.
  // Null for an AniList-only title, which has nothing on MAL to read.
  const malLive =
    title.mal_media_id === null
      ? Promise.resolve(null)
      : getMalLiveDetails(title.mal_media_id);
  const malChapters =
    title.mal_media_id === null
      ? Promise.resolve(null)
      : malLive.then((live) => live?.numChapters ?? title.num_chapters);

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
        <EntryHeader
          entry={entry}
          formatTag={formatTagFor(title, tags)}
          // Both sites' credits, merged, once both have answered. Nothing
          // until then: a half-list would name one author and then grow a
          // second, which reads as the first being wrong.
          authors={
            <Suspense fallback={null}>
              <AuthorsLine extras={anilist} malLive={malLive} />
            </Suspense>
          }
          // The stored covers first, then every poster both sites have once
          // they answer — so the picker opens at once and grows.
          coverAction={
            <Suspense
              fallback={
                <PosterPicker
                  entryId={entry.id}
                  title={displayTitle(title)}
                  catalog={title.main_picture_url}
                  current={entry.cover_url}
                  isPro={isPro}
                  options={posterOptions({
                    catalog: title.main_picture_url,
                    current: entry.cover_url,
                  })}
                />
              }
            >
              <PosterPickerWithLive
                entryId={entry.id}
                title={displayTitle(title)}
                catalog={title.main_picture_url}
                current={entry.cover_url}
                isPro={isPro}
                extras={anilist}
                malLive={malLive}
              />
            </Suspense>
          }
        >
          {/* The saved tags first, then merged with both sites' live genres
              once they answer — so a genre either site has added since the
              last sync shows without waiting for one. */}
          <Suspense
            fallback={
              <EntryTags
                titleId={title.id}
                tags={tags}
                allTags={allTags}
                isAdmin={admin}
              />
            }
          >
            <EntryTagsWithLiveGenres
              titleId={title.id}
              saved={tags}
              allTags={allTags}
              isAdmin={admin}
              extras={anilist}
              malLive={malLive}
            />
          </Suspense>
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

        {/* Only for a title only AniList has: how to link it to MyAnimeList.
            Streams in, since finding the MyAnimeList twin is a live search. */}
        {title.mal_media_id === null && title.anilist_media_id !== null ? (
          <Suspense fallback={null}>
            <EntryMalLink
              entryId={entry.id}
              title={{ ...title, anilist_media_id: title.anilist_media_id }}
            />
          </Suspense>
        ) : null}

        {/* Only for a MAL-backed title: an AniList-only row's num_chapters
            already came from AniList, so there is nothing to compare. */}
        {title.mal_media_id !== null ? (
          <Suspense fallback={null}>
            <ChapterCheck extras={anilist} malChapters={malChapters} />
          </Suspense>
        ) : null}

        {/* The same for the credits, and for the same reason only when MAL has
            the title: with one site there is nothing to compare. */}
        {title.mal_media_id !== null ? (
          <Suspense fallback={null}>
            <AuthorsCheck extras={anilist} malLive={malLive} />
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
              isPro={isPro}
            />
          }
        >
          <SourceEditorWithLinks
            extras={anilist}
            entryId={entry.id}
            sources={entry.entry_sources}
            catalog={catalog}
            total={chapterTotal(title)}
            isPro={isPro}
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

        {/* After the reader's own filing: this looks outward, at titles they
            may not track. Pro, and the works are only asked of AniList for
            Pro — without it the teaser needs nothing from anywhere. */}
        {isPro ? (
          <Suspense fallback={null}>
            <AuthorWorks extras={anilist} malLive={malLive} malMediaId={title.mal_media_id} />
          </Suspense>
        ) : (
          <EntryAuthorWorks isPro={false} />
        )}

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

/**
 * The title's tags, merged with the genres MyAnimeList and AniList give it
 * right now.
 *
 * The syncs already save both sites' genres as tags; this only closes the gap
 * until the next one. Genres are matched to tags by MAL genre id, whichever
 * site they came from, so a genre both sites give shows once.
 */
async function EntryTagsWithLiveGenres({
  saved,
  extras,
  malLive,
  ...props
}: {
  titleId: number;
  saved: Tag[];
  allTags: Tag[];
  isAdmin: boolean;
  extras: Promise<AniListMediaExtras | null>;
  malLive: Promise<MalLiveDetails | null>;
}) {
  const [media, mal] = await Promise.all([extras, malLive]);
  const live = await getTagsForMalGenres([
    ...(mal?.genres ?? []).map((genre) => genre.id),
    ...malGenresFor(media?.genres).map((genre) => genre.id),
  ]);

  return (
    <EntryTags
      {...props}
      tags={mergeTags(saved, live)}
      savedTagIds={new Set(saved.map((tag) => tag.id))}
    />
  );
}

/**
 * The poster picker, offering every poster MyAnimeList and AniList have —
 * AniList's banner included.
 */
async function PosterPickerWithLive({
  extras,
  malLive,
  ...props
}: {
  entryId: number;
  title: string;
  catalog: string | null;
  current: string | null;
  isPro: boolean;
  extras: Promise<AniListMediaExtras | null>;
  malLive: Promise<MalLiveDetails | null>;
}) {
  const [media, mal] = await Promise.all([extras, malLive]);

  return (
    <PosterPicker
      {...props}
      options={posterOptions({
        catalog: props.catalog,
        current: props.current,
        myanimelist: mal?.pictures,
        anilist: [media?.coverImage?.extraLarge ?? media?.coverImage?.large],
        anilistBanner: media?.bannerImage,
      })}
    />
  );
}

/**
 * The format tag to show as the header's format badge: the one matching the
 * title's kind (whose slug is the kind with `_` as `-`), else any format tag
 * the title carries. Null leaves the header showing the kind as plain text.
 */
function formatTagFor(
  title: { mal_media_kind: string | null },
  tags: Tag[],
): Tag | null {
  const formats = tags.filter((tag) => tag.kind === "format");
  const slug = title.mal_media_kind?.replaceAll("_", "-");
  return formats.find((tag) => tag.slug === slug) ?? formats[0] ?? null;
}

/** Who made the title, for the header — both sites' credits, merged. */
async function AuthorsLine({
  extras,
  malLive,
}: {
  extras: Promise<AniListMediaExtras | null>;
  malLive: Promise<MalLiveDetails | null>;
}) {
  const [media, mal] = await Promise.all([extras, malLive]);
  return <EntryAuthors authors={mergeAuthors(mal?.authors ?? null, media?.staff).authors} />;
}

/** Where MyAnimeList's credits and AniList's disagree. */
async function AuthorsCheck({
  extras,
  malLive,
}: {
  extras: Promise<AniListMediaExtras | null>;
  malLive: Promise<MalLiveDetails | null>;
}) {
  const [media, mal] = await Promise.all([extras, malLive]);
  return <AuthorCheck mismatches={mergeAuthors(mal?.authors ?? null, media?.staff).mismatches} />;
}

/**
 * The authors' other works, from AniList and MyAnimeList, each linked to its
 * entry page when the reader already tracks it and offered to add when they
 * do not.
 *
 * AniList's ride on the response the rest of the page already reads (see
 * getMediaExtras). MyAnimeList's cost one Jikan request per MAL-credited
 * author, cached for a day — see lib/mal/jikan.ts.
 */
async function AuthorWorks({
  extras,
  malLive,
  malMediaId,
}: {
  extras: Promise<AniListMediaExtras | null>;
  malLive: Promise<MalLiveDetails | null>;
  malMediaId: number | null;
}) {
  const [media, mal, hideMature, anilistConnection] = await Promise.all([
    extras,
    malLive,
    hidesMatureTitles(),
    getAniListConnection(),
  ]);
  const { authors } = mergeAuthors(mal?.authors ?? null, media?.staff);
  // Capped: Jikan allows about three requests a second.
  const malWorks = await Promise.all(
    authors
      .flatMap((author) => (author.mal ? [author.mal.id] : []))
      .slice(0, 3)
      .map(getPersonManga),
  );
  const works = withMalWorks(authorWorks(media), malWorks.flat(), malMediaId);

  const library =
    works.length === 0
      ? []
      : await getLibraryMatches({
          anilistIds: works.flatMap((work) =>
            work.anilistId === null ? [] : [work.anilistId],
          ),
          malIds: works.flatMap((work) =>
            work.malId === null ? [] : [work.malId],
          ),
        });

  return (
    <EntryAuthorWorks
      isPro
      authors={authors}
      works={relatedWorks(works, library, { hideMature })}
      anilistConnected={anilistConnection?.status === "active"}
    />
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
