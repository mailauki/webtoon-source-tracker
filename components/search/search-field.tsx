"use client";

import { useId, useRef } from "react";
import { Search, X } from "lucide-react";

import { useSearchFilters } from "@/components/search/search-filters";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

/**
 * The search page's field, in the header's sticky row.
 *
 * Always open, unlike the collapsing icon this replaced in the library header:
 * the field is the whole point of the page, so there is nothing for a closed
 * state to get out of the way of. It stays in the sticky row rather than in
 * the page body so the term is still editable after scrolling into the results
 * — the same reason the library's source chips stick.
 *
 * `autoFocus` because arriving here IS the request to search. It is deliberate
 * on a page whose only job is this field, and wrong on every other page, which
 * is why it lives here and not in the shared header.
 *
 * A keystroke only sets state — no navigation, no `?q=`, no remount. That is
 * the regression this app has been bitten by: the field used to carry
 * `key={urlQuery}` while the query lived in the URL, and each debounced write
 * unmounted the focused input, which on iOS takes the keyboard down with it.
 */
export function SearchField() {
  const { query, setQuery } = useSearchFilters();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Field>
      <FieldLabel htmlFor={inputId} className="sr-only">
        Search titles
      </FieldLabel>
      <InputGroup className="rounded-full bg-background dark:bg-muted">
        <InputGroupInput
          id={inputId}
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears rather than navigating away: the page is the
            // search, so there is nothing to back out to.
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Search MyAnimeList and your library…"
          autoFocus
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        {query ? (
          <InputGroupAddon align="inline-end">
            <Button
              variant="ghost"
              className="rounded-full"
              aria-label="Clear search"
              // Keeps the field focused through the click, so clearing does
              // not drop the keyboard on a phone.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <X />
            </Button>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </Field>
  );
}
