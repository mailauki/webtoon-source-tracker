"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";

import { addEntry, type AddEntryState } from "@/app/actions/add-entry";
import { useLibraryFilters } from "@/components/library-grid";
import { Button } from "@/components/ui/button";

/**
 * MyAnimeList catalog results for the current search, shown under the library.
 *
 * The header search drives the shelf above on its own; this half is opt-in.
 * Typing narrows the library and nothing else, and a button under the shelf
 * offers the catalog search as a second, deliberate step — so the common case
 * (finding a title you already have) never spends a MAL request, and the
 * results for a title you don't have are asked for rather than guessed at.
 *
 * The button is offered whenever the query is long enough, not only when the
 * shelf comes up empty: a search that matched two titles can still be missing
 * the third, and hiding the catalog behind "no local matches" would make
 * adding a title depend on the shelf happening not to match.
 *
 * Changing the query closes the panel again — see the `query` key at the call
 * site below. A fetched set of results belongs to the term it was fetched for,
 * and leaving it open across edits would either strand stale results under a
 * new term or put the catalog back on the typing path, which is the cost this
 * button exists to avoid.
 *
 * The term comes from <LibraryFilters> state, not from `?q=`. Reading the URL
 * meant this panel only woke once the debounced navigation committed, which
 * put it a beat behind the shelf; more importantly it made the URL write part
 * of the typing path, and re-rendering the page per keystroke was what closed
 * the mobile keyboard. The deferred copy is used so this never schedules a
 * fetch ahead of the keystroke being painted.
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
};

export function MalSearchResults() {
  const { deferredQuery } = useLibraryFilters();
  const query = deferredQuery.trim();
  const active = query.length >= MIN_QUERY_LENGTH;

  if (!active) return null;
  // Below this line the query is searchable, so the hooks always run in the
  // same order. Splitting the component here keeps the "too short" reset as
  // an unmount rather than a setState cascade inside an effect.
  //
  // Keyed by the query so editing the term remounts this and drops back to
  // the button: results fetched for one term must not sit under another.
  return <MalSearchPrompt key={query} query={query} />;
}

/**
 * The opt-in step: a button until the user asks for the catalog.
 *
 * `opened` is held here rather than inside the panel because the panel only
 * exists once it flips — mounting the panel *is* the request, so there is no
 * state for it to own before it runs.
 */
function MalSearchPrompt({ query }: { query: string }) {
  const [opened, setOpened] = useState(false);

  if (opened) return <MalSearchPanel query={query} />;

  return (
    <div className="grid justify-items-center gap-2 border-t border-border pt-6">
      <p className="text-sm text-muted-foreground">
        Not finding what you&rsquo;re looking for?
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpened(true)}
        className="rounded-pill"
      >
        <Search className="size-3.5" />
        Search MyAnimeList
      </Button>
    </div>
  );
}

function MalSearchPanel({ query }: { query: string }) {
  // The parent keys on the query, so this mounts once per searched term and
  // the effect below runs once. The abort is kept anyway: a slow request must
  // not land after the panel is gone.
  const [results, setResults] = useState<MalResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Titles added this session. The server revalidation refreshes the library
  // above, but these results came from MAL and would otherwise still say "Add".
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Aborts the request if the panel closes or the term moves on, so a slow
    // response can never land on a component that is no longer showing it.
    const controller = new AbortController();

    // No debounce: this runs on a click now, not on a keystroke. The term is
    // already settled by the time the button is pressed.
    (async () => {
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
        // An abort is the expected path when the panel unmounts, not a failure.
        if ((cause as Error).name === "AbortError") return;
        setResults([]);
        setError("Couldn't reach MyAnimeList.");
      } finally {
        // The aborted request's `finally` must not clear a newer one's spinner.
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
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

      {/* The route drops titles already in the library, so an empty set here
          can mean either "MAL has nothing" or "MAL has only what you own".
          The copy covers both rather than claiming MAL came up empty. */}
      {!loading && !error && results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing new on MyAnimeList matches “{query}”.
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

      {/* Results arrive already filtered to titles the user lacks, so the only
          "in library" state reachable here is one they just added. */}
      {added ? (
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <Check className="size-3" />
          Added
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
