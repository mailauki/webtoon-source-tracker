"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useDeferredValue,
  useEffect,
  useState,
  useTransition,
} from "react";

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
 * Search moved here for a second reason. It used to live in `?q=`, where the
 * server re-queried with an `ilike` and streamed a new grid — which meant
 * every debounced keystroke replaced the DOM under a focused input. On mobile
 * that dismisses the keyboard mid-word. The rows the page already fetched
 * carry their titles, so matching text needs no round-trip either; the query
 * is client state now and the grid narrows on the keystroke itself.
 *
 * `?q=` is still written, lazily and behind the typing, because it is what
 * <MalSearchResults> reads to search the MAL catalog and what makes a search
 * linkable. Nothing the user is looking at waits for it.
 *
 * The chips do NOT narrow search results — see LibraryGrid below for why.
 */

type Filters = { status: string; source: string };
type State = Filters & { sort: Sort };

type LibraryFilterContext = State & {
  /** Chip values are "" for All; stored as the explicit `all` sentinel. */
  setStatus: (value: string) => void;
  setSource: (value: string) => void;
  setSort: (value: Sort) => void;
  /**
   * What the user has typed, verbatim. The field renders this so the caret
   * never lags a keystroke behind.
   */
  query: string;
  setQuery: (value: string) => void;
  /**
   * The same query, deferred. The grid filters on this: React commits the
   * keystroke first and re-filters in a later interruptible pass, so a long
   * shelf cannot stutter the field.
   */
  deferredQuery: string;
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
  initialQuery = "",
  children,
}: {
  initial: State;
  /** `?q=` at page load, so a shared search URL arrives already applied. */
  initialQuery?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Real state, not useOptimistic: optimistic state only survives its
  // transition, and it is discarded in favour of the prop when that settles.
  // Since the save deliberately does not revalidate, no re-render ever brings
  // a fresh `initial` — so the chip would snap back to the page-load value the
  // moment the write finished. Here the client is the source of truth for the
  // rest of the session, and the server value is only the seed.
  const [state, setState] = useState(initial);

  // The query is plain state, deliberately not `useSearchParams()`. Reading it
  // from the URL would make every keystroke wait on a navigation before the
  // field could show the character — which is the lag that was interrupting
  // typing in the first place.
  const [query, setQuery] = useState(initialQuery);

  // The grid reads the deferred copy. React renders the typed character first
  // at high priority, then re-filters in a second, interruptible pass — so a
  // large shelf cannot make the field stutter between keystrokes.
  const deferredQuery = useDeferredValue(query);

  // Mirror the query into `?q=` so a search stays linkable and survives a
  // reload. Nothing on screen reads this back — the field and both result
  // sets run off the state above — so it is pure bookkeeping, debounced and
  // run from an effect well behind the keystroke.
  //
  // `replace` re-renders the page on the server, which is exactly what used
  // to close the mobile keyboard. It is safe now only because the input is no
  // longer keyed to the URL and no longer re-created by that render; the
  // debounce also means it lands in the pause after typing, not during it.
  //
  // What is already in the URL is tracked here rather than read back from
  // `window.location`: the location does not change until Next commits the
  // navigation, so a second keystroke arriving before then would compare
  // against a stale value and queue a duplicate write. Seeded with the query
  // the page was rendered for, so arriving on a shared link writes nothing.
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);

  useEffect(() => {
    if (query === syncedQuery) return;

    const timer = setTimeout(() => {
      setSyncedQuery(query);

      const next = new URLSearchParams(window.location.search);
      if (query) next.set("q", query);
      else next.delete("q");

      startTransition(() => {
        router.replace(next.size ? `/library?${next}` : "/library", {
          scroll: false,
        });
      });
    }, 500);

    // A keystroke during the delay re-runs this effect and cancels the
    // pending write, so only the settled term is ever pushed.
    return () => clearTimeout(timer);
  }, [query, syncedQuery, router]);

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
        query,
        setQuery,
        deferredQuery,
        pending,
      }}
    >
      {children}
    </FilterContext>
  );
}

/**
 * Whether a row's title contains the search term.
 *
 * Both titles are checked because the shelf shows one and the user may know
 * the other — a romanised title on the card is no reason for the English name
 * not to find it. `term` arrives already trimmed and lowercased so this does
 * not redo that work per row.
 *
 * This is a substring match, matching the `ilike '%term%'` the server used to
 * run, so moving the search into the browser did not change what it finds.
 */
function matchesTitle(entry: LibraryRow, term: string): boolean {
  const { title, title_en } = entry.media_titles ?? {};
  return (
    (title?.toLowerCase().includes(term) ?? false) ||
    (title_en?.toLowerCase().includes(term) ?? false)
  );
}

/**
 * Narrows the server's rows by the active chips and the search term.
 *
 * The empty states arrive as rendered nodes rather than a render function
 * taking `filtered`: this is a Client Component, and functions cannot cross
 * the server/client boundary. Only the *choice* between them depends on
 * client state, so the page supplies all three and this picks.
 */
export function LibraryGrid({
  entries,
  topSources = [],
  catalog = [],
  emptyUnfiltered,
  emptyFiltered,
  emptySearch,
}: {
  entries: LibraryRow[];
  topSources?: RankedSource[];
  catalog?: Source[];
  /** Nothing on the shelf at all. */
  emptyUnfiltered: React.ReactNode;
  /** Chips hid everything. */
  emptyFiltered: React.ReactNode;
  /** A search matched nothing. Falls back to `emptyUnfiltered` if omitted. */
  emptySearch?: React.ReactNode;
}) {
  const { status, source, sort, deferredQuery } = useLibraryFilters();
  const term = deferredQuery.trim().toLowerCase();
  const searching = term !== "";

  // A search deliberately ignores the chips. The chips are a standing view of
  // the shelf; a search is a one-off lookup of a specific title, and the user
  // asking for it by name has already said which one they want. Intersecting
  // the two hides the match whenever it happens to sit outside the current
  // view — and worse, the MAL panel below would then offer to add a title the
  // user already owns, because the shelf appeared not to have it.
  const visible = searching
    ? entries.filter((entry) => matchesTitle(entry, term))
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
    if (searching) return <>{emptySearch ?? emptyUnfiltered}</>;
    return <>{status || source ? emptyFiltered : emptyUnfiltered}</>;
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
