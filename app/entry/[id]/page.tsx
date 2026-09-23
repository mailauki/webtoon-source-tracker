import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EntryCollections } from "@/components/entry-collections";
import { EntryHeader } from "@/components/entry-header";
import { EntryRemove } from "@/components/entry-remove";
import { EntrySyncStatus } from "@/components/entry-sync-status";
import { EntrySourceEditor } from "@/components/entry-source-editor";
import { EntryTags } from "@/components/entry-tags";
import { ProgressEditor } from "@/components/progress-editor";
import { isAdmin, verifySession } from "@/lib/auth/dal";
import { chapterTotal } from "@/lib/data/chapter-totals";
import { displayTitle } from "@/lib/data/display-title";
import { getCollectionTargets } from "@/lib/data/collections";
import { getEntry } from "@/lib/data/entries";
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

        <ProgressEditor entry={entry} />

        <EntrySourceEditor
          entryId={entry.id}
          sources={entry.entry_sources}
          catalog={catalog}
          total={chapterTotal(title)}
        />

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
