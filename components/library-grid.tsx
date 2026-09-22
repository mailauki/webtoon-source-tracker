"use client";

import { createContext, useContext, useState, useTransition } from "react";

import { saveLibraryPrefs } from "@/app/actions/library-prefs";
import { EntryCard } from "@/components/entry-card";
import { selectCandidates } from "@/lib/data/pick-random";
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
 * Search is deliberately NOT here. It briefly was — a field in the header
 * filtering these same rows — but finding a title you already track and
 * finding one to add are the same gesture, and only one of them belonged on
 * this page. Both now live at /search, which searches this shelf and the
 * MyAnimeList catalog off one term. The chips stay here, where the shelf is.
 *
 * TODO(bulk-edit): a multi-select would belong in this provider too — it
 * already owns the rows and already spans the header and the grid, and the
 * chips have just narrowed the shelf to the set someone wants to act on. The
 * hard part is the write side, not the selection; see TODO.md.
 */

type Filters = {
  status: string;
  source: string;
  hideHiatus: boolean;
  ownedOnly: boolean;
  hideNsfw: boolean;
};
type State = Filters & { sort: Sort };

/**
 * What the provider is seeded with. Both toggles are optional because off is
 * the default everywhere: a caller that has no stored preference — and every
 * caller that predates either toggle — should show the whole shelf.
 */
type InitialState = Omit<State, "hideHiatus" | "ownedOnly" | "hideNsfw"> & {
  hideHiatus?: boolean;
  ownedOnly?: boolean;
  hideNsfw?: boolean;
};

type LibraryFilterContext = State & {
  /** Chip values are "" for All; stored as the explicit `all` sentinel. */
  setStatus: (value: string) => void;
  setSource: (value: string) => void;
  /** The hiatus toggle. Unlike the chips this is a boolean, not a sentinel. */
  setHideHiatus: (value: boolean) => void;
  /** The owned toggle. A boolean too, and positive where hiatus subtracts. */
  setOwnedOnly: (value: boolean) => void;
  /**
   * The adult-titles toggle, for a viewer who is allowed to see them at all.
   *
   * Unlike its siblings this one is also a setting — the same
   * `library_prefs.hide_nsfw` the Settings switch writes — because "keep
   * these off my shelf" is a standing preference, not a gesture. It is here
   * as well so it can be reached while browsing rather than only two pages
   * away, which is the whole point of a filter menu.
   */
  setHideNsfw: (value: boolean) => void;
  /**
   * False for an account under the age floor, which never receives adult rows
   * in the first place. The menu hides the item entirely when this is false:
   * a control that cannot change what is on screen is a dead control.
   */
  canSeeNsfw: boolean;
  setSort: (value: Sort) => void;
  pending: boolean;
  /**
   * The shelf the page fetched. Held here rather than passed to each consumer
   * so the filters and the rows they narrow travel together — the dice needs
   * both, and handing it a second copy of the array would leave two things to
   * keep in step.
   */
  entries: LibraryRow[];
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
  entries = [],
  canSeeNsfw = false,
  children,
}: {
  initial: InitialState;
  /** The shelf, shared with every consumer of the filters. */
  entries?: LibraryRow[];
  /**
   * Whether this account may see adult titles at all. Defaults to false, so
   * a caller that predates the age gate shows no toggle rather than a
   * control that does nothing.
   */
  canSeeNsfw?: boolean;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  // Real state, not useOptimistic: optimistic state only survives its
  // transition, and it is discarded in favour of the prop when that settles.
  // Since the save deliberately does not revalidate, no re-render ever brings
  // a fresh `initial` — so the chip would snap back to the page-load value the
  // moment the write finished. Here the client is the source of truth for the
  // rest of the session, and the server value is only the seed.
  const [state, setState] = useState<State>({
    hideHiatus: false,
    ownedOnly: false,
    hideNsfw: false,
    ...initial,
  });

  function update(patch: Partial<Filters>) {
    setState((current) => ({ ...current, ...patch }));

    startTransition(async () => {
      // "" is the All chip; store it as the sentinel so "show everything"
      // stays distinct from "never chose". Booleans are stored as-is: the
      // toggle has only two states, so it needs no third sentinel.
      await saveLibraryPrefs(
        Object.fromEntries(
          Object.entries(patch).map(([k, v]) =>
            typeof v === "boolean" ? [k, v] : [k, v || ALL],
          ),
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
        setHideHiatus: (hideHiatus) => update({ hideHiatus }),
        setOwnedOnly: (ownedOnly) => update({ ownedOnly }),
        setHideNsfw: (hideNsfw) => update({ hideNsfw }),
        canSeeNsfw,
        setSort: updateSort,
        pending,
        entries,
      }}
    >
      {children}
    </FilterContext>
  );
}

/**
 * Narrows the server's rows by the active chips.
 *
 * The empty states arrive as rendered nodes rather than a render function
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
  /** Nothing on the shelf at all. */
  emptyUnfiltered: React.ReactNode;
  /** Chips hid everything. */
  emptyFiltered: React.ReactNode;
}) {
  const { status, source, hideHiatus, ownedOnly, hideNsfw, sort } =
    useLibraryFilters();

  // The same function the dice draws from, so the shelf and the roll can never
  // disagree about which titles a chip selection covers.
  const visible = selectCandidates(entries, {
    status,
    source,
    hideHiatus,
    ownedOnly,
    hideNsfw,
  });
  const ordered = sortEntries(visible, sort);

  if (visible.length === 0) {
    const narrowed = status || source || hideHiatus || ownedOnly || hideNsfw;
    return <>{narrowed ? emptyFiltered : emptyUnfiltered}</>;
  }

  return (
    // Fewer, wider columns than the old bare-cover grid: the card now carries
    // a title, a chip row and a stat strip over the art, and at 8-across none
    // of them had the width to be legible.
    <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
