"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

import {
  addAniListEntry,
  type AddAniListEntryState,
} from "@/app/actions/add-anilist-entry";
import { addEntry, type AddEntryState } from "@/app/actions/add-entry";
import { CoverImage } from "@/components/cover-image";
import { useSearchFilters } from "@/components/search/search-filters";
import { Button } from "@/components/ui/button";
import type { MergedResult } from "@/lib/data/cross-search";
import { MIN_QUERY_LENGTH, type MediaKind } from "@/lib/data/search";
import { displayTitle } from "@/lib/data/display-title";

/**
 * Catalog results — the half of the page that finds titles you do not have yet.
 *
 * Searches MyAnimeList and AniList together and shows one merged list. Rows
 * both sites have are marked, as are the fields they disagree about: two
 * catalogs describing one title differently is exactly the thing this app
 * exists to notice, and hiding it behind a single site's answer would be
 * choosing one at random.
 *
 * Neither site needs a connected account to search, so there is no gate here
 * any more — see app/api/catalog/search/route.ts.
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

/** The term, once it has stopped changing. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);

  return settled;
}

export function CatalogResults({
  anilistConnected,
}: {
  anilistConnected: boolean;
}) {
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
          Add from MyAnimeList or AniList
        </h2>
      </div>

      {query.length < MIN_QUERY_LENGTH ? (
        // Not an error: MyAnimeList's own minimum is three characters, and
        // anything shorter comes back as noise from either site.
        <p className="text-sm text-muted-foreground">
          Keep typing — searching needs at least {MIN_QUERY_LENGTH} characters.
        </p>
      ) : (
        <CatalogPanel
          query={settled}
          includeNsfw={includeNsfw}
          mediaKind={mediaKind}
          anilistConnected={anilistConnected}
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
  anilistConnected,
}: {
  query: string;
  includeNsfw: boolean;
  mediaKind: MediaKind;
  catchingUp: boolean;
  anilistConnected: boolean;
}) {
  const [results, setResults] = useState<MergedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which catalogs could not be reached for the current term, so a short list
  // can say why rather than looking like the search simply found little.
  const [unavailable, setUnavailable] = useState<string[]>([]);
  // Titles added this session. The server revalidation refreshes the library
  // half above, but these results came from a catalog and would otherwise
  // still say "Add".
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

        const response = await fetch(`/api/catalog/search?${params}`, {
          signal: controller.signal,
        });

        // Parsed defensively: a crashed route can answer with an HTML error
        // page, and letting that throw here would collapse a real server-side
        // failure into the generic "couldn't reach" message below — which
        // points at the network and hides the actual cause.
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          setResults([]);
          setUnavailable([]);
          setError(
            body?.error ??
              `Search failed (${response.status}). Check the server logs.`,
          );
        } else {
          setResults(body?.results ?? []);
          setUnavailable(body?.unavailable ?? []);
          setError(null);
        }
      } catch (cause) {
        // An abort is the expected path when the term moves on, not a failure.
        if ((cause as Error).name === "AbortError") return;
        setResults([]);
        setUnavailable([]);
        setError("Couldn't reach the catalogs.");
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
          Searching MyAnimeList and AniList…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}

      {/* One catalog down is still a usable search, but the results are
          narrower than they look. Saying which half is missing is what keeps a
          partial answer from reading as a complete one. */}
      {!busy && !error && unavailable.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {unavailable.includes("mal") ? "MyAnimeList" : "AniList"} could
          not be reached, so these results are from{" "}
          {unavailable.includes("mal") ? "AniList" : "MyAnimeList"} only.
        </p>
      ) : null}

      {/* The route drops titles already in the library and the half of the
          catalog the switch excludes, so an empty set here has several
          readings. The copy names the switch rather than claiming the catalogs
          came up empty, because that is the one the user can act on. */}
      {!busy && !error && results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {mediaKind === "novels" ? "novels" : "webtoons, manga or manhwa"}{" "}
          match “{query}” that you don&rsquo;t already have.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {results.map((result) => (
            <CatalogResultCard
              key={result.key}
              result={result}
              anilistConnected={anilistConnected}
              added={
                result.mal_media_id !== null && added.has(result.mal_media_id)
              }
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

/** How a merged row's provenance reads on the card. */
const SOURCE_LABELS: Record<MergedResult["source"], string> = {
  both: "Both",
  mal: "MAL only",
  anilist: "AniList only",
};

/** Plain-language names for the fields the two sites can disagree about. */
const FIELD_LABELS: Record<MergedResult["mismatches"][number]["field"], string> =
  {
    title_en: "English title",
    chapters: "Chapters",
    volumes: "Volumes",
  };

function CatalogResultCard({
  result,
  added,
  onAdded,
  anilistConnected,
}: {
  result: MergedResult;
  added: boolean;
  onAdded: React.Dispatch<React.SetStateAction<Set<number>>>;
  anilistConnected: boolean;
}) {
  const router = useRouter();
  // A title MyAnimeList does not have is added through AniList instead, which
  // is a different action with a different source of truth — see
  // app/actions/add-anilist-entry.ts. Both are wired up unconditionally
  // because hooks cannot be called behind a branch; only one is ever
  // submitted.
  const [malState, malAction, malPending] = useActionState<AddEntryState, FormData>(
    addEntry,
    null,
  );
  const [anilistState, anilistAction, anilistPending] = useActionState<
    AddAniListEntryState,
    FormData
  >(addAniListEntry, null);

  const anilistOnly = result.mal_media_id === null;
  const state = anilistOnly ? anilistState : malState;
  const action = anilistOnly ? anilistAction : malAction;
  const pending = anilistOnly ? anilistPending : malPending;
  // Guards the effect below. `state` keeps its successful value for the life
  // of the component, so without this the effect re-fires on every render that
  // follows the add — and since it calls router.refresh(), which triggers
  // another render, that is an infinite loop rather than a stray extra call.
  const handled = useRef(false);

  const malId = result.mal_media_id;
  // Rows are tracked as added by whichever id they actually have. AniList-only
  // ids are negated so they cannot collide with a MAL id in the same set.
  const addedKey = malId ?? -(result.anilist_media_id ?? 0);

  useEffect(() => {
    if (!state?.ok || handled.current) return;
    handled.current = true;

    onAdded((prev) => new Set(prev).add(addedKey));
    // The action revalidated the library; pull the fresh rows in so the title
    // shows up in the half above without a manual reload.
    router.refresh();
  }, [state, onAdded, router, addedKey]);

  const hasMismatch = result.mismatches.length > 0;

  return (
    <li className="grid gap-1.5">
      <div className="relative aspect-[1/2] overflow-hidden rounded-md bg-muted">
        <CoverImage
          src={result.main_picture_url}
          title={displayTitle(result)}
          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 130px"
          className="object-cover"
        />

        {/* Which catalogs had this title. Top-left so it never collides with
            the title block, which grows upward from the bottom. */}
        <span
          className={`absolute left-1 top-1 rounded-pill px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
            result.source === "both"
              ? "bg-black/70 text-white/90"
              : "bg-accent/90 text-accent-foreground"
          }`}
        >
          {SOURCE_LABELS[result.source]}
        </span>

        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 grid gap-0.5 p-2">
          <h3 className="line-clamp-3 font-display text-sm font-bold leading-tight text-white drop-shadow">
            {displayTitle(result)}
          </h3>
          {/* MAL's own value, underscores and all ("light_novel"), or
              AniList's where the row came from there. Worth the line here in a
              way it is not on the library card: this page searches one side of
              the switch at a time, and the kind is how you tell a light novel
              from the manga adaptation with the same name. */}
          {result.media_kind ? (
            <p className="text-[10px] uppercase tracking-wide text-white/70">
              {result.media_kind.replace("_", " ").toLowerCase()}
            </p>
          ) : null}
        </div>
      </div>

      {/* The point of searching both at once: where the two catalogs describe
          the same title differently, say so and show both values. Rendered as
          text rather than an icon — "552 vs 551 chapters" is the whole content
          of the warning, and an icon would only prompt a hover to find it. */}
      {hasMismatch ? (
        <ul className="grid gap-0.5">
          {result.mismatches.map((mismatch) => (
            <li
              key={mismatch.field}
              className="text-[10px] leading-tight text-muted-foreground"
            >
              <span className="font-medium text-alert">
                {FIELD_LABELS[mismatch.field]}
              </span>{" "}
              differs — MAL {mismatch.mal}, AniList {mismatch.anilist}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Results arrive already filtered to titles the user lacks, so the only
          "in library" state reachable here is one they just added. */}
      {added ? (
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <Check className="size-3" />
          Added
        </p>
      ) : anilistOnly && !anilistConnected ? (
        // Adding this title writes to AniList, since MyAnimeList does not have
        // it. Unlike searching, that needs a connected account — so the card
        // says what is missing rather than offering a button that would fail.
        <Link
          href="/api/anilist/connect"
          className="text-center text-[10px] leading-tight text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Connect AniList to add
        </Link>
      ) : (
        <form action={action}>
          {anilistOnly ? (
            <input
              type="hidden"
              name="anilist_media_id"
              value={result.anilist_media_id ?? ""}
            />
          ) : (
            <input type="hidden" name="mal_media_id" value={malId ?? ""} />
          )}
          {/* The search already matched this title across both catalogs, so
              the AniList id is known here and the mirror need not look it up
              again. Empty when only MyAnimeList had the title; the action
              reads that as "no id", not as "clear the one on file". */}
          {anilistOnly ? null : (
            <input
              type="hidden"
              name="anilist_media_id"
              value={result.anilist_media_id ?? ""}
            />
          )}
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
