"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Title search, collapsed to an icon in the header until invoked.
 *
 * Same URL-as-state contract as the chips: the query lives in `?q=`, so
 * results stay linkable and /library stays a Server Component.
 *
 * One field drives two result sets. The server filters the user's shelf by
 * `?q=`, and <MalSearchResults> reads the same param to search the MAL
 * catalog underneath — so finding a title you have and adding one you don't
 * are the same gesture.
 *
 * Expanding overlays the nav rather than reflowing it. Laying the field over
 * the row keeps the header exactly one row tall in both states — animating the
 * nav out of the way instead makes the buttons jump under the pointer as the
 * field grows.
 */
export function HeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const inputId = useId();

  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  // A query already in the URL means search is in play: start open so the
  // active term stays visible instead of hiding behind an icon.
  const [open, setOpen] = useState(urlQuery !== "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value === urlQuery) return;

    // Debounce: one request per keystroke would hammer the database.
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set("q", value);
      else next.delete("q");

      startTransition(() => {
        router.replace(next.size ? `/library?${next}` : "/library", {
          scroll: false,
        });
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [value, urlQuery, params, router]);

  function close() {
    setOpen(false);
    setValue("");
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // The input mounts this tick; focus it on the next one.
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
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
        <Input
          id={inputId}
          ref={inputRef}
          key={urlQuery}
          type="search"
          defaultValue={urlQuery}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          onBlur={() => {
            // Collapse only when it would hide nothing: an active query stays
            // on screen so the filtered state is never silently invisible.
            if (!value) setOpen(false);
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
            if (value) {
              setValue("");
              if (inputRef.current) inputRef.current.value = "";
              inputRef.current?.focus();
            } else {
              close();
            }
          }}
          aria-label={value ? "Clear search" : "Close search"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
