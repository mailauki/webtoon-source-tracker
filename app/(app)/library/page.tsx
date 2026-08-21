import Link from "next/link";

import { EntryCard } from "@/components/entry-card";
import { LibrarySearch } from "@/components/library-search";
import { SourceFilter } from "@/components/source-filter";
import { SyncButton } from "@/components/sync-button";
import { Button } from "@/components/ui/button";
import { getMalConnection, verifySession } from "@/lib/auth/dal";
import { getLibrary, getStatusCounts } from "@/lib/data/entries";
import { getSources } from "@/lib/data/sources";
import { formatLastSynced, isStale } from "@/lib/sync/staleness";

const STATUS_CHIPS = [
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_read", label: "Plan to read" },
];

export const metadata = { title: "Library" };

export default async function LibraryPage({
  searchParams,
}: PageProps<"/library">) {
  await verifySession();
  const connection = await getMalConnection();

  // Not connected (or disconnected): the whole page becomes the CTA, since
  // there is nothing to show until a list is linked.
  if (!connection || connection.status === "disconnected") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-display text-2xl font-bold">Connect MyAnimeList</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your reading list lives on MyAnimeList. Connect it to bring your
          titles in, then record where you actually read each one.
        </p>
        <Button
          asChild
          className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
        >
          <Link href="/mal/connect">Connect MyAnimeList</Link>
        </Button>
        {connection?.status === "disconnected" ? (
          <p className="text-xs text-muted-foreground">
            Your saved sources are still here — reconnecting restores everything.
          </p>
        ) : null}
      </div>
    );
  }

  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const source = typeof params.source === "string" ? params.source : undefined;
  const q = typeof params.q === "string" ? params.q : undefined;

  const [entries, statusCounts, sources] = await Promise.all([
    getLibrary({ status, source, q }),
    getStatusCounts(),
    getSources(),
  ]);
  const stale = isStale(connection.last_synced_at);
  const hasFilters = Boolean(status || source || q);

  const statusChips = STATUS_CHIPS.map((chip) => ({
    ...chip,
    count: statusCounts[chip.value],
  })).filter((chip) => (chip.count ?? 0) > 0);

  // Only offer sources the user could actually be filtering by.
  const sourceChips = sources
    .filter((s) => s.slug !== "other" || s.owner_id !== null)
    .map((s) => ({ value: s.slug ?? `custom-${s.id}`, label: s.name }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Library</h1>
          <p className="text-sm text-muted-foreground">
            {entries.length} {entries.length === 1 ? "title" : "titles"} ·
            MyAnimeList as {connection.mal_username}
          </p>
        </div>

        <SyncButton
          lastSyncedLabel={formatLastSynced(connection.last_synced_at)}
          stale={stale}
        />
      </div>

      {connection.status === "needs_reauth" ? (
        <p className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">
          Your MyAnimeList connection expired.{" "}
          <Link href="/mal/connect" className="font-medium underline">
            Reconnect
          </Link>
        </p>
      ) : null}

      <div className="grid gap-3">
        <LibrarySearch />
        <SourceFilter statuses={statusChips} sources={sourceChips} />
      </div>

      {entries.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
          <p className="font-display text-lg font-semibold">
            {hasFilters ? "No titles match" : "Nothing synced yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {hasFilters
              ? "Try a different filter or clear the search."
              : "Hit Sync to pull your list from MyAnimeList."}
          </p>
          {hasFilters ? (
            <Button asChild variant="outline" size="sm" className="rounded-pill">
              <Link href="/library">Clear filters</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        // Tapas packs ~8 across at desktop width with tight gutters.
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
