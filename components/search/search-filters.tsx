"use client";

import {
  createContext,
  useContext,
  useDeferredValue,
  useState,
  useTransition,
} from "react";

import { saveLibraryPrefs } from "@/app/actions/library-prefs";
import type { LibraryRow } from "@/lib/data/entries";
import { DEFAULT_MEDIA_KIND, type MediaKind } from "@/lib/data/search";

/**
 * State for the search page: the term, and the two switches beside it.
 *
 * Shaped after <LibraryFilters>, and for the same reason — the field renders
 * into the header's sticky row, the switches into the row under it, and the
 * results into the page body, so the state has to sit above all three.
 *
 * The term is plain client state and the URL is out of it entirely. That is
 * settled ground in this app: `?q=` used to hold it, and every debounced
 * keystroke wrote the URL, re-rendered the page under a focused input, and on
 * a phone dismissed the keyboard mid-word. Nothing here reads the URL back —
 * both result sets run off this state — so writing it would put a navigation
 * on the typing path for a link nobody follows.
 *
 * The switches are the opposite: they ARE preferences, not a transient
 * gesture, so they seed from the stored row and save behind the click the same
 * way the library chips do. A search is a lookup you do once; "I read novels"
 * and "show me adult titles" are standing facts about how you search.
 */

type SearchState = {
  includeNsfw: boolean;
  mediaKind: MediaKind;
};

type SearchFilterContext = SearchState & {
  setIncludeNsfw: (value: boolean) => void;
  setMediaKind: (value: MediaKind) => void;
  /**
   * What the user has typed, verbatim. The field renders this so the caret
   * never lags a keystroke behind.
   */
  query: string;
  setQuery: (value: string) => void;
  /**
   * The same term, deferred. The results read this: React commits the
   * keystroke first and re-filters in a later interruptible pass, so a long
   * shelf cannot stutter the field.
   */
  deferredQuery: string;
  /** True while a switch is being saved; the switches dim rather than block. */
  pending: boolean;
  /**
   * True when the account has not confirmed it is 18 or over.
   *
   * Presentation only — it lets the NSFW switch explain itself rather than
   * appear to work and change nothing. The check that matters is in the
   * search route, which ignores `nsfw=1` from an unconfirmed account however
   * the request was made.
   */
  matureLocked: boolean;
  /** The user's shelf, for the half of the page that searches it. */
  entries: LibraryRow[];
};

const SearchContext = createContext<SearchFilterContext | null>(null);

/** Read the search state. Must be inside <SearchFilters>. */
export function useSearchFilters(): SearchFilterContext {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("useSearchFilters must be used within <SearchFilters>");
  }
  return ctx;
}

export function SearchFilters({
  initial,
  entries = [],
  matureLocked = false,
  children,
}: {
  /** Both optional: each has a default, and a user may have set neither. */
  initial?: Partial<SearchState>;
  entries?: LibraryRow[];
  /** Defaults to unlocked, so a caller that predates the age gate is unchanged. */
  matureLocked?: boolean;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();

  // Real state rather than useOptimistic, matching <LibraryFilters>: the save
  // deliberately does not revalidate, so no re-render ever brings a fresh
  // `initial` and an optimistic value would snap back to the page-load one the
  // moment the write finished. The client owns these for the rest of the
  // session; the server value is only the seed.
  const [state, setState] = useState<SearchState>({
    includeNsfw: false,
    mediaKind: DEFAULT_MEDIA_KIND,
    ...initial,
  });

  // Starts empty on every visit. A search is a gesture, not a place, so there
  // is nothing to restore it from.
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  function update(patch: Partial<SearchState>) {
    setState((current) => ({ ...current, ...patch }));

    // Fire-and-forget behind the change, like the chips: losing a remembered
    // switch is not worth interrupting a click with an error, and the page has
    // already moved by the time the write lands.
    startTransition(async () => {
      await saveLibraryPrefs({
        ...(patch.includeNsfw !== undefined
          ? { includeNsfw: patch.includeNsfw }
          : {}),
        ...(patch.mediaKind !== undefined
          ? { mediaKind: patch.mediaKind }
          : {}),
      });
    });
  }

  return (
    <SearchContext
      value={{
        ...state,
        // The floor resolved once, here, rather than at each reader. The
        // switch is hidden while it applies, but CatalogResults reads this
        // value directly to build its request — so leaving the stored
        // preference visible would have the client keep asking for `nsfw=1`
        // with no control on screen to explain why. The route rejects it
        // regardless; this stops it being sent at all.
        includeNsfw: state.includeNsfw && !matureLocked,
        setIncludeNsfw: (includeNsfw) => update({ includeNsfw }),
        setMediaKind: (mediaKind) => update({ mediaKind }),
        query,
        setQuery,
        deferredQuery,
        pending,
        entries,
        matureLocked,
      }}
    >
      {children}
    </SearchContext>
  );
}
