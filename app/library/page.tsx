import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { LibraryFilters, LibraryGrid } from "@/components/library-grid";
import { MalSearchResults } from "@/components/mal-search-results";
import { SortFilter } from "@/components/sort-filter";
import { SourceFilter } from "@/components/source-filter";
import { StatusFilter } from "@/components/status-filter";
import { SyncButton } from "@/components/sync-button";
import { Button } from "@/components/ui/button";
import {
  getLibraryPrefs,
  getMalConnection,
  verifySession,
} from "@/lib/auth/dal";
import { getLibrary, getStatusCounts } from "@/lib/data/entries";
import { resolveActiveChip, resolveSort } from "@/lib/data/library-prefs";
import { getSources, getTopSources } from "@/lib/data/sources";
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
      <AppShell>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <h1 className="font-display text-2xl font-bold">
            Connect MyAnimeList
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your reading list lives on MyAnimeList. Connect it to bring your
            titles in, then record where you actually read each one.
          </p>
          <Button
            asChild
            className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
          >
            <Link href="/api/mal/connect">Connect MyAnimeList</Link>
          </Button>
          {connection?.status === "disconnected" ? (
            <p className="text-xs text-muted-foreground">
              Your saved sources are still here — reconnecting restores
              everything.
            </p>
          ) : null}
        </div>
      </AppShell>
    );
  }

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;

  // Status, source, sort and now search are all applied in the browser. The
  // rows below carry every field they narrow on, so none of them needs a
  // round-trip — and for search that matters twice over: re-rendering this
  // page per keystroke was remounting the input and closing the mobile
  // keyboard mid-word. `?q=` still arrives here to seed the field and to
  // drive the MAL panel, but it no longer filters the query.
  const prefs = await getLibraryPrefs();
  const activeStatus = resolveActiveChip(prefs?.status);
  const activeSource = resolveActiveChip(prefs?.source);
  const activeSort = resolveSort(prefs?.sort);

  const [entries, statusCounts, sources, topSources] = await Promise.all([
    getLibrary(),
    getStatusCounts(),
    getSources(),
    getTopSources(),
  ]);
  const stale = isStale(connection.last_synced_at);

  const statusChips = STATUS_CHIPS.map((chip) => ({
    ...chip,
    count: statusCounts[chip.value],
  })).filter((chip) => (chip.count ?? 0) > 0);

  // Only offer sources the user could actually be filtering by.
  const sourceChips = sources
    .filter((s) => s.slug !== "other" || s.owner_id !== null)
    .map((s) => ({ value: s.slug ?? `custom-${s.id}`, label: s.name }));

  return (
    // Wraps the whole shell: the status chips render into the header slot and
    // the grid into the body, and a click on either has to move the other.
    <LibraryFilters
      initial={{
        status: activeStatus,
        source: activeSource,
        sort: activeSort,
      }}
      initialQuery={q ?? ""}
    >
      <AppShell
        searchable
        filters={
          // Both live in the secondary row: the chips narrow the shelf, the
          // menu orders what is left, and neither is much use without seeing
          // the other.
          <div className="flex items-center justify-between gap-2">
            <StatusFilter statuses={statusChips} />
            <SortFilter />
          </div>
        }
      >
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold">Library</h1>
              {/* The whole shelf, deliberately — this is a standing fact
                  about the library, and recounting it per keystroke would put
                  a number that changes under every character next to a field
                  the user is still typing in. The grid below shows what
                  matches. */}
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
              <Link href="/api/mal/connect" className="font-medium underline">
                Reconnect
              </Link>
            </p>
          ) : null}

          <SourceFilter sources={sourceChips} />

          <LibraryGrid
            entries={entries}
            topSources={topSources}
            catalog={sources}
            emptyFiltered={
              <EmptyState
                title="No titles match"
                body="Try a different filter or clear the search."
              />
            }
            // All three empty states are supplied as rendered nodes and the
            // grid picks between them: which one applies depends on the live
            // query, which is client state now, and a node cannot be chosen
            // here without re-rendering this page per keystroke.
            emptyUnfiltered={
              <EmptyState
                title="Nothing synced yet"
                body="Hit Sync to pull your list from MyAnimeList."
              />
            }
            // A search that matches nothing on the shelf: the copy stays
            // short, because the MAL results below are the actual next step
            // and pointing at Sync would steer the user away from them.
            emptySearch={
              <EmptyState
                title="Not in your library"
                body="Nothing here matches — check the MyAnimeList results below."
              />
            }
          />

          {/* Searching is also how a title gets added, so MAL results sit
              under the shelf whenever a query is active. */}
          <MalSearchResults />
        </div>
      </AppShell>
    </LibraryFilters>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
