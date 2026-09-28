"use client";

import { LibraryBig } from "lucide-react";

import { EntryCard } from "@/components/entry-card";
import { useSearchFilters } from "@/components/search/search-filters";
import type { RankedSource, Source } from "@/lib/data/rank-sources";
import { matchesMediaKind, titleMatchScore } from "@/lib/data/search";

/**
 * The half of the search page that looks at titles you already track.
 *
 * It comes first, above the catalog, because "do I already have this" is the
 * cheaper question and the one that settles what to do next: if the title is
 * here, adding it again is not the answer, and the catalog below has already
 * dropped it from its results for that reason.
 *
 * Matching is forgiving — case, accents, punctuation and spacing are ignored,
 * a longer term may carry a typo, and every title a row is known by counts,
 * not only the one on its card. See titleMatchScore in lib/data/search.ts.
 *
 * The rows are the ones the page fetched, so this narrows in the browser with
 * no round-trip — a keystroke moves the grid in the same render, which is what
 * keeps the field usable on a phone.
 *
 * The library's own chips (status, source, hiatus, owned) deliberately do not
 * apply here. A search is a lookup of one title by name, and the user asking
 * for it has already said which one they want; intersecting that with a view
 * they set on another page would hide the match and then let the catalog offer
 * to add a title they already own.
 *
 * The novels/webtoons switch DOES apply, because it is not one of those views:
 * it says which kind of thing this search is about, and a page showing novels
 * on top and webtoons underneath would answer a question nobody asked. The
 * NSFW switch, by contrast, never touches this list — what the user already
 * tracks is theirs to see, the same stance getMangaList takes when it syncs
 * with `nsfw: true`.
 */
export function LibraryResults({
  topSources = [],
  catalog = [],
  isPro,
}: {
  topSources?: RankedSource[];
  catalog?: Source[];
  /** Owned chapters are Pro-only; passed straight through to each card. */
  isPro: boolean;
}) {
  const { deferredQuery, mediaKind, entries } = useSearchFilters();
  const term = deferredQuery.trim();

  // Nothing typed yet: the page's own prompt covers the empty state, and a
  // heading over no rows would just be noise above it.
  if (term === "") return null;

  // Closest first: a title containing the term as typed outranks one that
  // only matches ignoring spaces, which outranks one found through a typo.
  // The sort is stable, so within a tier the shelf keeps its own order.
  const matches = entries
    .filter((entry) =>
      matchesMediaKind(entry.media_titles?.mal_media_kind, mediaKind),
    )
    .map((entry) => ({
      entry,
      score: titleMatchScore(entry.media_titles, term),
    }))
    .filter((match): match is { entry: typeof match.entry; score: number } =>
      match.score !== null,
    )
    .sort((a, b) => a.score - b.score)
    .map((match) => match.entry);

  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2">
        <LibraryBig aria-hidden className="size-4 text-muted-foreground" />
        <h2 className="font-display text-lg font-semibold">In your library</h2>
        {matches.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {matches.length}
          </span>
        ) : null}
      </div>

      {matches.length === 0 ? (
        // Deliberately small and unalarming: on this page a miss here is the
        // normal case on the way to the catalog below, not a dead end.
        <p className="text-sm text-muted-foreground">
          Nothing you track matches “{deferredQuery.trim()}”.
        </p>
      ) : (
        // The same columns the library grid uses, so a card is the size the
        // user already knows it at.
        <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {matches.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              topSources={topSources}
              catalog={catalog}
              isPro={isPro}
            />
          ))}
        </div>
      )}
    </section>
  );
}
