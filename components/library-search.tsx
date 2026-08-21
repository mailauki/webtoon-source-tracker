"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * Title search, debounced into the URL.
 *
 * Like the filter chips, state lives in searchParams so results stay linkable
 * and /library remains a Server Component.
 *
 * The input is uncontrolled-with-a-key: `key={urlQuery}` remounts it whenever
 * the URL query changes from elsewhere (a chip, the back button, "Clear
 * filters"), which resyncs the field without a setState-in-effect.
 */
export function LibrarySearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
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

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        key={urlQuery}
        type="search"
        defaultValue={urlQuery}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search your library…"
        aria-label="Search your library"
        className="rounded-pill pl-9 pr-9"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            if (inputRef.current) inputRef.current.value = "";
          }}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
