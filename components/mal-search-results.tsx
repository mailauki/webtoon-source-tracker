"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Check } from "lucide-react";

import { addEntry, type AddEntryState } from "@/app/actions/add-entry";
import { Button } from "@/components/ui/button";

/**
 * MyAnimeList catalog results for the current `?q=`, shown under the library.
 *
 * The header search drives both halves: the server filters the shelf by `?q=`,
 * and this reads the same param to search MAL. One field, two result sets —
 * so "is this in my library, and if not can I add it?" is one question.
 *
 * Fetching goes through a Route Handler, not a Server Action: Next dispatches
 * actions sequentially per client, which would queue every keystroke behind
 * the last. Here a superseded request is simply aborted.
 */

const MIN_QUERY_LENGTH = 3;

type MalResult = {
  mal_media_id: number;
  title: string;
  title_en: string | null;
  main_picture_url: string | null;
  media_kind: string | null;
  num_chapters: number | null;
  in_library: boolean;
};

export function MalSearchResults() {
  const query = (useSearchParams().get("q") ?? "").trim();
  const active = query.length >= MIN_QUERY_LENGTH;

  if (!active) return null;
  // Below this line the query is searchable, so the hooks always run in the
  // same order. Splitting the component here keeps the "too short" reset as
  // an unmount rather than a setState cascade inside an effect.
  return <MalSearchPanel query={query} />;
}

function MalSearchPanel({ query }: { query: string }) {
  // Keyed by query at the call site would remount on every keystroke; instead
  // the effect below owns the fetch and aborts anything superseded.
  const [results, setResults] = useState<MalResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Titles added this session. The server revalidation refreshes the library
  // above, but these results come from MAL and would otherwise still say "Add".
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Aborts the previous request when the query moves on, so a slow response
    // can never land after a newer one and overwrite it.
    const controller = new AbortController();

    // The header already debounces the URL write; this second, shorter delay
    // covers a paste or a fast typist landing several URL updates in a row.
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/mal/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );

        // Parsed defensively: a crashed route can answer with an HTML error
        // page, and letting that throw here would collapse a real server-side
        // failure into the generic "couldn't reach" message below — which
        // points at the network and hides the actual cause.
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          setResults([]);
          setError(
            body?.error ??
              `Search failed (${response.status}). Check the server logs.`,
          );
        } else {
          setResults(body?.results ?? []);
          setError(null);
        }
      } catch (cause) {
        // An abort is the expected path when typing continues, not a failure.
        if ((cause as Error).name === "AbortError") return;
        setResults([]);
        setError("Couldn't reach MyAnimeList.");
      } finally {
        // The aborted request's `finally` must not clear a newer one's spinner.
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <section className="grid gap-3 border-t border-border pt-6">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold">
          Add from MyAnimeList
        </h2>
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing on MyAnimeList matches “{query}”.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {results.map((result) => (
            <MalResultCard
              key={result.mal_media_id}
              result={result}
              added={added.has(result.mal_media_id)}
              // setAdded is a stable setter, so the card's effect does not
              // re-run every render. An inline closure here would give the
              // effect a new identity each time and loop forever.
              onAdded={setAdded}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MalResultCard({
  result,
  added,
  onAdded,
}: {
  result: MalResult;
  added: boolean;
  onAdded: React.Dispatch<React.SetStateAction<Set<number>>>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<AddEntryState, FormData>(
    addEntry,
    null,
  );
  // Guards the effect below. `state` keeps its successful value for the life
  // of the component, so without this the effect re-fires on every render that
  // follows the add — and since it calls router.refresh(), which triggers
  // another render, that is an infinite loop rather than a stray extra call.
  const handled = useRef(false);

  useEffect(() => {
    if (!state?.ok || handled.current) return;
    handled.current = true;

    onAdded((prev) => new Set(prev).add(result.mal_media_id));
    // The action revalidated /library; pull the fresh shelf into view so the
    // title appears above without a manual reload.
    router.refresh();
  }, [state, onAdded, router, result.mal_media_id]);

  const inLibrary = result.in_library || added;

  return (
    <li className="grid gap-1.5">
      <div className="relative aspect-[1/2] overflow-hidden rounded-md bg-muted">
        {result.main_picture_url ? (
          <Image
            src={result.main_picture_url}
            alt=""
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 130px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2">
            <span className="text-center font-display text-xs font-semibold text-muted-foreground">
              {result.title}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-2">
          <h3 className="line-clamp-3 font-display text-sm font-bold leading-tight text-white drop-shadow">
            {result.title}
          </h3>
        </div>
      </div>

      {inLibrary ? (
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <Check className="size-3" />
          In library
        </p>
      ) : (
        <form action={action}>
          <input
            type="hidden"
            name="mal_media_id"
            value={result.mal_media_id}
          />
          {/* Plan to read is the safe default: it claims no progress the user
              hasn't made. They can change it on the entry page. */}
          <input type="hidden" name="list_status" value="plan_to_read" />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={pending}
            className="w-full rounded-pill text-[11px]"
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Plus className="size-3" />
            )}
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
      )}

      {state?.ok === false ? (
        <p role="alert" className="text-[11px] text-alert">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
