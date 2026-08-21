"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";

import { saveLibraryPrefs } from "@/app/actions/library-prefs";
import { EntryCard } from "@/components/entry-card";
import {
  ALL,
  serializeSort,
  sortEntries,
  type Sort,
} from "@/lib/data/library-prefs";
import type { LibraryRow } from "@/lib/data/entries";
import type { RankedSource } from "@/lib/data/rank-sources";
import type { Source } from "@/lib/data/rank-sources";

/**
 * Status and source filtering, client-side.
 *
 * The filters used to live in `?status=` / `?source=`, where changing one
 * navigated and the server re-queried. Now that the choice is stored per user,
 * the URL is no longer the state — so a click has nothing to navigate to, and
 * the DB write is the only thing left to trigger a refresh. Awaiting a
 * round-trip before the grid moves would make every chip click feel broken.
 *
 * So the filtering moved here instead. Every field the chips filter on
 * (`list_status`, and each row's source slugs) already rides along on the rows
 * the page fetched, so narrowing them needs no extra query — the click is
 * instant and the save happens behind it.
 *
 * Search stays on the server: `?q=` is an indexed `ilike`, and shipping the
 * whole library to the browser to match text would be worse on every axis.
 * The chips do NOT narrow those results — see LibraryGrid below for why.
 */

type Filters = { status: string; source: string };
type State = Filters & { sort: Sort };

type LibraryFilterContext = State & {
  /** Chip values are "" for All; stored as the explicit `all` sentinel. */
  setStatus: (value: string) => void;
  setSource: (value: string) => void;
  setSort: (value: Sort) => void;
  pending: boolean;
};

const FilterContext = createContext<LibraryFilterContext | null>(null);

/** Read the active filters from the chips. Must be inside LibraryFilters. */
export function useLibraryFilters(): LibraryFilterContext {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useLibraryFilters must be used within <LibraryFilters>");
  }
  return ctx;
}

/**
 * Holds the filter state for the chips and the grid.
 *
 * This wraps both because they sit in different parts of the tree — the status
 * chips render into the header slot, the grid into the page body — and a click
 * on either has to move the other.
 */
export function LibraryFilters({
  initial,
  children,
}: {
  initial: State;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  // Real state, not useOptimistic: optimistic state only survives its
  // transition, and it is discarded in favour of the prop when that settles.
  // Since the save deliberately does not revalidate, no re-render ever brings
  // a fresh `initial` — so the chip would snap back to the page-load value the
  // moment the write finished. Here the client is the source of truth for the
  // rest of the session, and the server value is only the seed.
  const [state, setState] = useState(initial);

  function update(patch: Partial<Filters>) {
    setState((current) => ({ ...current, ...patch }));

    startTransition(async () => {
      // "" is the All chip; store it as the sentinel so "show everything"
      // stays distinct from "never chose".
      await saveLibraryPrefs(
        Object.fromEntries(
          Object.entries(patch).map(([k, v]) => [k, v || ALL]),
        ),
      );
    });
  }

  // Separate from `update`: sort is an object rather than a chip string, and
  // it has no All sentinel to normalise to.
  function updateSort(sort: Sort) {
    setState((current) => ({ ...current, sort }));
    startTransition(async () => {
      await saveLibraryPrefs({ sort: serializeSort(sort) });
    });
  }

  return (
    <FilterContext
      value={{
        ...state,
        setStatus: (status) => update({ status }),
        setSource: (source) => update({ source }),
        setSort: updateSort,
        pending,
      }}
    >
      {children}
    </FilterContext>
  );
}

/**
 * Narrows the server's rows by the active chips.
 *
 * The two empty states arrive as rendered nodes rather than a render function
 * taking `filtered`: this is a Client Component, and functions cannot cross
 * the server/client boundary. Only the *choice* between them depends on
 * client state, so the page supplies both and this picks.
 */
export function LibraryGrid({
  entries,
  topSources = [],
  catalog = [],
  emptyUnfiltered,
  emptyFiltered,
}: {
  entries: LibraryRow[];
  topSources?: RankedSource[];
  catalog?: Source[];
  emptyUnfiltered: React.ReactNode;
  emptyFiltered: React.ReactNode;
}) {
  const { status, source, sort } = useLibraryFilters();
  const searching = (useSearchParams().get("q") ?? "").trim() !== "";

  // A search deliberately ignores the chips. The chips are a standing view of
  // the shelf; a search is a one-off lookup of a specific title, and the user
  // asking for it by name has already said which one they want. Intersecting
  // the two hides the match whenever it happens to sit outside the current
  // view — and worse, the MAL panel below would then offer to add a title the
  // user already owns, because the shelf appeared not to have it.
  const visible = searching
    ? entries
    : entries.filter((entry) => {
        if (status && entry.list_status !== status) return false;

        if (source === "none") return entry.entry_sources.length === 0;
        if (source) {
          return entry.entry_sources.some((es) => es.sources?.slug === source);
        }
        return true;
      });

  // Sorting applies to search results too. The chips are skipped during a
  // search because they would hide the match; an order hides nothing, and a
  // search can still return enough rows to be worth ordering.
  const ordered = sortEntries(visible, sort);

  if (visible.length === 0) {
    // While searching the chips are not applied, so a miss is never "your
    // filters hid it" — it is simply not on the shelf.
    return (
      <>{!searching && (status || source) ? emptyFiltered : emptyUnfiltered}</>
    );
  }

  return (
    // Tapas packs ~8 across at desktop width with tight gutters.
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {ordered.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          topSources={topSources}
          catalog={catalog}
        />
      ))}
    </div>
  );
}
