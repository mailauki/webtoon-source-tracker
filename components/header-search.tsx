"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { useLibraryFilters } from "@/components/library-grid";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";

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
 * Now a keystroke only sets state, and the URL is out of the loop entirely —
 * `?q=` is neither read nor written. The rows are already in the browser, so
 * the grid narrows in the same render and this input is never unmounted or
 * re-created.
 *
 * One field still drives two result sets: the shelf above filters locally and
 * the MAL catalog search underneath runs off the same state — so finding a
 * title you have and adding one you don't are the same gesture.
 *
 * Expanding overlays the nav rather than reflowing it. Laying the field over
 * the row keeps the header exactly one row tall in both states — animating the
 * nav out of the way instead makes the buttons jump under the pointer as the
 * field grows.
 */
export function HeaderSearch() {
  const { query, setQuery } = useLibraryFilters();
  const inputId = useId();

  // Always starts collapsed. The query is session state that begins empty on
  // every load, so there is never a term waiting to be shown at mount.
  const [open, setOpen] = useState(false);
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
			<Button
				variant="ghost"
				className="rounded-full"
				onClick={() => setOpen(true)}
				aria-label="Search titles"
				aria-expanded={false}
				size="icon"
			>
				<Search />
			</Button>
    );
  }

	return (
		<Field className="absolute inset-y-3.5 right-0 z-10 flex w-full max-w-md items-center">
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
						if (e.key === "Escape") close();
					}}
					onBlur={() => {
						// Collapse only when it would hide nothing: an active query stays
						// on screen so the filtered state is never silently invisible.
						if (!query) setOpen(false);
					}}
					placeholder="Search titles to find or add…"
					className="min-w-xs"
				/>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <Button
					variant="ghost"
					className="rounded-full"
					aria-label={query ? "Clear search" : "Close search"}
					onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (query) {
              setQuery("");
              inputRef.current?.focus();
            } else {
              close();
            }
          }}
					>
						<X />
					</Button> 
        </InputGroupAddon>
      </InputGroup>
    </Field>
	)
}
