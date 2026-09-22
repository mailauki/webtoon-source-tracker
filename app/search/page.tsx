import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { CatalogResults } from "@/components/search/catalog-results";
import { LibraryResults } from "@/components/search/library-results";
import { SearchField } from "@/components/search/search-field";
import { SearchFilters } from "@/components/search/search-filters";
import { SearchPrompt } from "@/components/search/search-prompt";
import { SearchSwitches } from "@/components/search/search-switches";
import {
  getLibraryPrefs,
  getMalConnection,
  isAgeConfirmedAdult,
  verifySession,
} from "@/lib/auth/dal";
import { getLibrary } from "@/lib/data/entries";
import { resolveMediaKind } from "@/lib/data/search";
import { getSources, getTopSources } from "@/lib/data/sources";

export const metadata = { title: "Search" };

/**
 * One page for both halves of finding a title.
 *
 * Search used to be a collapsing field in the library header, filtering the
 * shelf, with the MyAnimeList catalog behind a button underneath it. That put
 * the two questions in the wrong order for the one the app is actually asked
 * most often — "is this on MyAnimeList, and can I add it" — and it made the
 * library page carry a second, unrelated result set below its grid.
 *
 * Here the catalog leads: it searches on its own as soon as the term settles,
 * and the shelf is matched alongside it so that finding a title you already
 * track is still one gesture rather than a trip back to /library. Keeping both
 * on one page is also what lets the catalog drop titles you already have — it
 * can only do that honestly when the ones it dropped are visible above it.
 *
 * This page takes no search params. The term is client state and never reaches
 * the URL: writing `?q=` per settled keystroke re-rendered the page under a
 * focused input, which on a phone closes the keyboard mid-word. See
 * components/search/search-filters.tsx.
 */
export default async function SearchPage() {
  await verifySession();

  // The switches are per-user preferences, so they seed from the same row the
  // library chips use. Missing values resolve to their defaults: webtoons, and
  // no adult titles.
  const [prefs, connection] = await Promise.all([
    getLibraryPrefs(),
    getMalConnection(),
  ]);

  // The shelf is fetched whole, exactly as /library fetches it: matching a
  // title against rows already in the browser is what lets a keystroke narrow
  // the results in the same render, with no round-trip to interrupt typing.
  // The two source lists are what an EntryCard needs to offer its menu.
  const [entries, sources, topSources, isAdult] = await Promise.all([
    getLibrary(),
    getSources(),
    getTopSources(),
    isAgeConfirmedAdult(),
  ]);

  // A disconnected account has no token to search MAL with. Everything else on
  // the page still works, so this only turns the catalog half into an
  // explanation rather than gating the route.
  const connected = !!connection && connection.status !== "disconnected";

  return (
    // Wraps the shell: the field renders into the header's sticky row and the
    // results into the body, and both run off the same term.
    <SearchFilters
      initial={{
        includeNsfw: prefs?.search_include_nsfw ?? false,
        mediaKind: resolveMediaKind(prefs?.search_media_kind),
      }}
      entries={entries}
      // Presentation only; the route enforces the same floor on every request.
      matureLocked={!isAdult}
    >
      <AppShell
        secondaryRow={<SearchField />}
        // A tier below the field rather than beside it: on a phone the field
        // needs the full width, and the switches change what a search means
        // rather than how it is typed.
        tertiaryRow={<SearchSwitches />}
      >
        <div className="grid gap-6">
          {connection?.status === "needs_reauth" ? (
            <p className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">
              Your MyAnimeList connection expired, so catalog results may be
              missing.{" "}
              <Link href="/api/mal/connect" className="font-medium underline">
                Reconnect
              </Link>
            </p>
          ) : null}

          <SearchPrompt />
          <LibraryResults topSources={topSources} catalog={sources} />
          <CatalogResults connected={connected} />
        </div>
      </AppShell>
    </SearchFilters>
  );
}
