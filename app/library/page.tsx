import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { LibraryFilters, LibraryGrid } from "@/components/library-grid";
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
import { resolveActiveChip } from "@/lib/data/library-prefs";
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

  // Status and source are per-user stored state, not URL state — the chips
  // apply them in the browser. Search stays here: `?q=` is a database match,
  // and it is a one-off lookup rather than a view the user settles into.
  const prefs = await getLibraryPrefs();
  const activeStatus = resolveActiveChip(prefs?.status);
  const activeSource = resolveActiveChip(prefs?.source);

  const [entries, statusCounts, sources] = await Promise.all([
    getLibrary({ q }),
    getStatusCounts(),
    getSources(),
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
    <LibraryFilters initial={{ status: activeStatus, source: activeSource }}>
      <AppShell searchable filters={<StatusFilter statuses={statusChips} />}>
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
              <Link href="/api/mal/connect" className="font-medium underline">
                Reconnect
              </Link>
            </p>
          ) : null}

          <SourceFilter sources={sourceChips} />

          <LibraryGrid
            entries={entries}
            emptyFiltered={
              <EmptyState
                title="No titles match"
                body="Try a different filter or clear the search."
              />
            }
            // An active search that returned nothing reads the same way as a
            // filter that matches nothing, even with every chip on "All".
            emptyUnfiltered={
              q ? (
                <EmptyState
                  title="No titles match"
                  body="Try a different filter or clear the search."
                />
              ) : (
                <EmptyState
                  title="Nothing synced yet"
                  body="Hit Sync to pull your list from MyAnimeList."
                />
              )
            }
          />
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
