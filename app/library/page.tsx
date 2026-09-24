import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { LibraryFilterMenu } from "@/components/library-filter-menu";
import {
  LibraryFilters,
  LibraryGrid,
  SelectToggle,
} from "@/components/library-grid";
import { RandomPick } from "@/components/random-pick";
import { SyncButton } from "@/components/sync-button";
import { Button } from "@/components/ui/button";
import {
  getLibraryPrefs,
  getAniListConnection,
  getMalConnection,
  isAgeConfirmedAdult,
  verifySession,
} from "@/lib/auth/dal";
import { countUnmatchedToAniList } from "@/lib/data/cross-search";
import { getLibrary, getStatusCounts } from "@/lib/data/entries";
import {
  resolveActiveChip,
  resolveLayout,
  resolveSort,
} from "@/lib/data/library-prefs";
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

export default async function LibraryPage() {
  await verifySession();
  const [connection, anilist] = await Promise.all([
    getMalConnection(),
    getAniListConnection(),
  ]);

  const malLinked = !!connection && connection.status !== "disconnected";
  const anilistLinked = !!anilist && anilist.status !== "disconnected";

  // The CTA is for an account linked to NEITHER site. Either one on its own is
  // a complete way to use the app: AniList can hold titles MyAnimeList does
  // not have, and gating the shelf on MAL would hide a library the user can
  // see perfectly well on anilist.co.
  if (!malLinked && !anilistLinked) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <h1 className="font-display text-2xl font-bold">
            Connect a reading list
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your reading list lives on MyAnimeList or AniList. Connect either
            one to bring your titles in, then record where you actually read
            each one.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              asChild
              className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
            >
              <Link href="/api/mal/connect">Connect MyAnimeList</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-pill">
              <Link href="/api/anilist/connect">Connect AniList</Link>
            </Button>
          </div>
          {connection?.status === "disconnected" ||
          anilist?.status === "disconnected" ? (
            <p className="text-xs text-muted-foreground">
              Your saved sources are still here — reconnecting restores
              everything.
            </p>
          ) : null}
        </div>
      </AppShell>
    );
  }

  // Status, source and sort are all applied in the browser. The rows below
  // carry every field they narrow on, so none of them needs a round-trip.
  // This page takes no search params: searching moved to /search, which does
  // both halves of it — this shelf and the MyAnimeList catalog — off one
  // term.
  const prefs = await getLibraryPrefs();
  const activeStatus = resolveActiveChip(prefs?.status);
  const activeSource = resolveActiveChip(prefs?.source);
  const activeSort = resolveSort(prefs?.sort);
  // Grid unless the user asked for the list. See resolveLayout for why an
  // unrecognised stored value falls back rather than throwing.
  const activeLayout = resolveLayout(prefs?.layout);
  // Both default to off: a title should never disappear from the shelf on a
  // visit where the user did not ask for it. That matters more for owned-only,
  // which would otherwise empty the shelf of anyone who has marked nothing.
  const hideHiatus = prefs?.hide_hiatus ?? false;
  const ownedOnly = prefs?.owned_only ?? false;
  // The stored preference matters only for a viewer who may see adult titles
  // at all; getLibrary() has already removed them for everyone else, so the
  // toggle would filter an empty set and the menu hides it.
  const canSeeNsfw = await isAgeConfirmedAdult();
  const hideNsfw = canSeeNsfw && (prefs?.hide_nsfw ?? false);

  const [entries, statusCounts, sources, topSources] = await Promise.all([
    getLibrary(),
    getStatusCounts(),
    getSources(),
    getTopSources(),
  ]);
  // Whichever sites are linked, the shelf is stale when ANY of them is due —
  // one button syncs them all, so it should light up if there is anything for
  // it to do. The label follows the oldest of the two for the same reason.
  const syncedAts = [
    ...(malLinked ? [connection!.last_synced_at] : []),
    ...(anilistLinked ? [anilist!.last_synced_at] : []),
  ];
  const stale = syncedAts.some((at) => isStale(at));
  // Nulls first: a site that has never synced is the oldest thing there is.
  const oldestSyncedAt = syncedAts.includes(null)
    ? null
    : syncedAts.sort()[0] ?? null;

  /**
   * Titles that exist here but have never been matched to AniList.
   *
   * The Sync button only ever PULLS — MyAnimeList into the app, AniList into
   * the app. Copying the library the other way is a bulk write to an account
   * this app does not own, so it stays behind the confirmation dialog on
   * /settings. What this count fixes is the button quietly doing half of what
   * "sync" sounds like: without a word here, a user who expected their MAL
   * list to appear on AniList has no way to find out why it did not.
   *
   * Counted from rows already on the page rather than with another query.
   * `anilist_media_id` is filled in as titles get matched, so this shrinks on
   * its own as the account sync is run.
   */
  const unpushedToAniList = anilistLinked
    ? countUnmatchedToAniList(entries)
    : 0;

  // Named in the order they are authoritative: MyAnimeList owns any title it
  // has, AniList covers the rest.
  const linkedLabel = [
    malLinked ? `MyAnimeList as ${connection!.mal_username}` : null,
    anilistLinked ? `AniList as ${anilist!.anilist_username}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const statusChips = STATUS_CHIPS.map((chip) => ({
    ...chip,
    count: statusCounts[chip.value],
  })).filter((chip) => (chip.count ?? 0) > 0);

  // Only offer sources the user could actually be filtering by.
  const sourceChips = sources
    .filter((s) => s.slug !== "other" || s.owner_id !== null)
    .map((s) => ({ value: s.slug ?? `custom-${s.id}`, label: s.name }));

  return (
    // Wraps the whole shell: the filter menu renders into the header slot and
    // the grid into the body, and a choice in the menu has to move the grid.
    <LibraryFilters
      canSeeNsfw={canSeeNsfw}
      initial={{
        status: activeStatus,
        source: activeSource,
        hideHiatus,
        ownedOnly,
        hideNsfw,
        sort: activeSort,
        layout: activeLayout,
      }}
      entries={entries}
    >
      <AppShell
        // One row, one control. This used to be two sticky tiers — status
        // chips and three buttons above, source chips below — which on a
        // phone cost more height than the first row of covers. Everything
        // they did now lives in the menu; see LibraryFilterMenu for why each
        // filter became the kind of menu item it did.
        secondaryRow={
          <div className="flex items-center gap-2">
            <LibraryFilterMenu statuses={statusChips} sources={sourceChips} />
            <SelectToggle />
          </div>
        }
      >
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold">Library</h1>
              {/* The whole shelf, deliberately — this is a standing fact
                  about the library, not a running count of what the filters
                  have left. The grid below shows that. */}
              <p className="text-sm text-muted-foreground">
                {entries.length} {entries.length === 1 ? "title" : "titles"} ·{" "}
                {linkedLabel}
              </p>
            </div>

            <SyncButton
              lastSyncedLabel={formatLastSynced(oldestSyncedAt)}
              stale={stale}
            />
          </div>

          {/* Above the shelf rather than in the filter row: two of its three
              questions reach past the filters, so it is not a filter control
              and sitting beside the menu would suggest it was. */}
          <RandomPick />

          {connection?.status === "needs_reauth" ? (
            <p className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">
              Your MyAnimeList connection expired.{" "}
              <Link href="/api/mal/connect" className="font-medium underline">
                Reconnect
              </Link>
            </p>
          ) : null}

          {/* Only when there is something to do about it, and only when
              AniList is actually connected — otherwise the AniList section on
              /settings is the thing to point at, not the sync. */}
          {unpushedToAniList > 0 && anilist?.status === "active" ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {unpushedToAniList}{" "}
              {unpushedToAniList === 1 ? "title isn't" : "titles aren't"} on
              AniList yet. Syncing here only brings titles in —{" "}
              <Link href="/settings" className="font-medium underline">
                copy them to AniList
              </Link>{" "}
              from Settings.
            </p>
          ) : null}

          {anilist?.status === "needs_reauth" ? (
            <p className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">
              Your AniList connection expired.{" "}
              <Link href="/api/anilist/connect" className="font-medium underline">
                Reconnect
              </Link>
            </p>
          ) : null}

          <LibraryGrid
            entries={entries}
            topSources={topSources}
            catalog={sources}
            emptyFiltered={
              <EmptyState
                title="No titles match"
                body="Try a different filter, or look the title up on Search."
              />
            }
            // Both empty states are supplied as rendered nodes and the grid
            // picks between them: which one applies depends on the filters,
            // which are client state, and a node cannot be chosen here
            // without re-rendering this page per click.
            emptyUnfiltered={
              <EmptyState
                title="Nothing synced yet"
                body="Hit Sync to pull your list from MyAnimeList."
              />
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
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">{body}</p>
    </div>
  );
}
