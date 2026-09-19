"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

import { addEntry, type AddEntryState } from "@/app/actions/add-entry";
import { CoverImage } from "@/components/cover-image";
import { useSearchFilters } from "@/components/search/search-filters";
import { Button } from "@/components/ui/button";
import { MIN_QUERY_LENGTH, type MediaKind } from "@/lib/data/search";
import { displayTitle } from "@/lib/data/display-title";

/**
 * MyAnimeList catalog results — the half of the page that finds titles you do
 * not have yet.
 *
 * This used to be an opt-in panel under the library grid, behind a "Search
 * MyAnimeList" button. That button existed because typing there was primarily
 * a library filter, and spending a MAL request per search would have taxed the
 * common case of finding a title you already own. On a page whose whole
 * purpose is the catalog that reasoning inverts: making the user ask twice for
 * the thing they came for is the friction, so the search runs on its own.
 *
 * What replaces the button is a debounce. The request fires once the term
 * settles rather than per keystroke, which is what the button was really
 * buying — and unlike the button it costs the user nothing. Flipping either
 * switch refetches immediately: that is a deliberate click, already settled.
 *
 * Fetching goes through a Route Handler, not a Server Action: Next dispatches
 * actions sequentially per client, which would queue every settled term behind
 * the last. Here a superseded request is simply aborted.
 */

/**
 * How long the term has to sit still before it costs a MAL request.
 *
 * Long enough that a word typed straight through is one request, short enough
 * that it still feels like it answered the typing.
 */
const DEBOUNCE_MS = 350;

type CatalogResult = {
  mal_media_id: number;
  title: string;
  title_en: string | null;
  main_picture_url: string | null;
  media_kind: string | null;
  num_chapters: number | null;
};

/** The term, once it has stopped changing. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);

  return settled;
}

export function CatalogResults({ connected }: { connected: boolean }) {
  const { deferredQuery, includeNsfw, mediaKind } = useSearchFilters();
  const query = deferredQuery.trim();
  const settled = useDebounced(query, DEBOUNCE_MS);

  // Nothing typed: the page's own prompt covers this, and a heading over an
  // empty panel would sit between the user and it.
  if (query === "") return null;

  return (
    <section className="grid gap-3 border-t border-border pt-6">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold">
          Add from MyAnimeList
        </h2>
      </div>

      {!connected ? (
        // The catalog search runs against the user's own MAL token, so there
        // is nothing to fall back to here — say what is missing rather than
        // reporting a failed search.
        <p className="text-sm text-muted-foreground">
          <Link href="/api/mal/connect" className="font-medium underline">
            Connect MyAnimeList
          </Link>{" "}
          to search its catalog and add titles from here.
        </p>
      ) : query.length < MIN_QUERY_LENGTH ? (
        // Not an error: MyAnimeList's own minimum is three characters, and
        // anything shorter comes back as noise.
        <p className="text-sm text-muted-foreground">
          Keep typing — MyAnimeList needs at least {MIN_QUERY_LENGTH}{" "}
          characters.
        </p>
      ) : (
        <CatalogPanel
          query={settled}
          includeNsfw={includeNsfw}
          mediaKind={mediaKind}
          // Shown while the typed term is ahead of the one that was searched,
          // so the panel never looks settled on a stale answer.
          catchingUp={settled !== query}
        />
      )}
    </section>
  );
}

function CatalogPanel({
  query,
  includeNsfw,
  mediaKind,
  catchingUp,
}: {
  query: string;
  includeNsfw: boolean;
  mediaKind: MediaKind;
  catchingUp: boolean;
}) {
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Titles added this session. The server revalidation refreshes the library
  // half above, but these results came from MAL and would otherwise still say
  // "Add".
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    // The term below MIN_QUERY_LENGTH never reaches this component, but the
    // debounced value can still be shorter than the live one on the way up.
    if (query.length < MIN_QUERY_LENGTH) return;

    // Aborts the request if the term moves on or a switch flips, so a slow
    // response can never land over a newer one.
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, kind: mediaKind });
        // Only sent when asked for: the route reads anything else as off.
        if (includeNsfw) params.set("nsfw", "1");

        const response = await fetch(`/api/mal/search?${params}`, {
          signal: controller.signal,
        });

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
        // An abort is the expected path when the term moves on, not a failure.
        if ((cause as Error).name === "AbortError") return;
        setResults([]);
        setError("Couldn't reach MyAnimeList.");
      } finally {
        // The aborted request's `finally` must not clear a newer one's spinner.
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [query, includeNsfw, mediaKind]);

  const busy = loading || catchingUp;

  return (
    <div className="grid gap-3">
      {busy ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Searching MyAnimeList…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}

      {/* The route drops titles already in the library and the half of the
          catalog the switch excludes, so an empty set here has several
          readings. The copy names the switch rather than claiming MAL came up
          empty, because that is the one the user can act on. */}
      {!busy && !error && results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {mediaKind === "novels" ? "novels" : "webtoons, manga or manhwa"}{" "}
          on MyAnimeList match “{query}” that you don&rsquo;t already have.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {results.map((result) => (
            <CatalogResultCard
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
    </div>
  );
}

function CatalogResultCard({
  result,
  added,
  onAdded,
}: {
  result: CatalogResult;
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
    // The action revalidated the library; pull the fresh rows in so the title
    // shows up in the half above without a manual reload.
    router.refresh();
  }, [state, onAdded, router, result.mal_media_id]);

  return (
    <li className="grid gap-1.5">
      <div className="relative aspect-[1/2] overflow-hidden rounded-md bg-muted">
        <CoverImage
          src={result.main_picture_url}
          title={displayTitle(result)}
          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 130px"
          className="object-cover"
        />

        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 grid gap-0.5 p-2">
          <h3 className="line-clamp-3 font-display text-sm font-bold leading-tight text-white drop-shadow">
            {displayTitle(result)}
          </h3>
          {/* MAL's own value, underscores and all ("light_novel"). Worth the
              line here in a way it is not on the library card: this page
              searches one side of the switch at a time, and the kind is how
              you tell a light novel from the manga adaptation with the same
              name. */}
          {result.media_kind ? (
            <p className="text-[10px] uppercase tracking-wide text-white/70">
              {result.media_kind.replace("_", " ")}
            </p>
          ) : null}
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
          <input type="hidden" name="mal_media_id" value={result.mal_media_id} />
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
