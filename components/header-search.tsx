"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { useLibraryFilters } from "@/components/library-grid";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Title search, collapsed to an icon in the header until invoked.
 *
 * The query is client state, held by <LibraryFilters> alongside the chips.
 * It used to live in `?q=`, with the server re-querying and streaming a new
 * grid per debounced keystroke. Two things about that broke typing on mobile:
 * the field carried `key={urlQuery}`, so each URL write remounted the input
 * and the OS dismissed the keyboard with the element it was attached to; and
 * the grid swapping underneath moved the page while a word was half typed.
 *
 * Now a keystroke only sets state. The rows are already in the browser, so
 * the grid narrows in the same render and this input is never unmounted or
 * re-created. `?q=` is still written behind the typing — see LibraryFilters —
 * because <MalSearchResults> reads it and a search stays linkable, but the
 * field no longer waits on it.
 *
 * One field still drives two result sets: the shelf above filters locally,
 * and the MAL catalog search underneath runs off the URL — so finding a title
 * you have and adding one you don't are the same gesture.
 *
 * Expanding overlays the nav rather than reflowing it. Laying the field over
 * the row keeps the header exactly one row tall in both states — animating the
 * nav out of the way instead makes the buttons jump under the pointer as the
 * field grows.
 */
export function HeaderSearch() {
  const { query, setQuery } = useLibraryFilters();
  const inputId = useId();

  // A query already in play (a shared `?q=` URL) means search is active: start
  // open so the term stays visible instead of hiding behind an icon.
  const [open, setOpen] = useState(query !== "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on expand. In an effect rather than in the click handler because the
  // input does not exist until this render commits — and unlike a rAF, this
  // runs before the browser paints, which keeps it inside the user gesture
  // that iOS requires before it will raise the keyboard.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) inputRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search titles"
        aria-expanded={false}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search className="size-4" />
      </button>
    );
  }

  return (
    // Overlays the nav. `inset-y-0 right-0` anchors it to the row, and the
    // max-width keeps it from swallowing the wordmark on narrow screens.
    <div className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md items-center pl-2">
      <label htmlFor={inputId} className="sr-only">
        Search titles
      </label>
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        {/* Controlled, and with no `key`: this element has to survive every
            keystroke, because unmounting a focused input closes the mobile
            keyboard. */}
        <Input
          id={inputId}
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          onBlur={() => {
            // Collapse only when it would hide nothing: an active query stays
            // on screen so the filtered state is never silently invisible.
            if (!query) setOpen(false);
          }}
          placeholder="Search titles to find or add…"
          className={cn(
            "rounded-pill border-border bg-background pl-9 pr-9",
            // Hide the WebKit affordance; the X below is the clear control.
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        <button
          type="button"
          // Runs before blur, which would otherwise collapse the field first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (query) {
              setQuery("");
              inputRef.current?.focus();
            } else {
              close();
            }
          }}
          aria-label={query ? "Clear search" : "Close search"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
