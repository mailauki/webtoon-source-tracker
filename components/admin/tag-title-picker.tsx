"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { tagTitle, type TagState } from "@/app/actions/tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionTitle } from "@/lib/data/collection-items";

/**
 * Search the catalog and put a tag on what comes back.
 *
 * The search itself is a plain GET form writing `?q=` — the page re-runs
 * searchCatalogTitles() and hands the results back down. Not a fetch per
 * keystroke: this is an admin surface used a handful of times, and the
 * catalog is the whole table (see searchCatalogTitles for why it cannot be
 * filtered in the browser the way AddTitlesDialog filters a library). A
 * submitted search is one query instead of one per character, and it survives
 * a reload, which matters when tagging a run of titles.
 *
 * Catalog only. There is deliberately no MyAnimeList search here — a title
 * nobody has ever synced cannot be tagged, and importing one is separate
 * deferred work rather than something to smuggle in behind this box.
 */
export function TagTitlePicker({
  tagId,
  results,
  query,
  taggedTitleIds,
}: {
  tagId: number;
  /** Catalog matches for `query`, already searched by the page. */
  results: CollectionTitle[];
  query: string;
  /** Titles already carrying this tag — offering them would only fail. */
  taggedTitleIds: number[];
}) {
  const tagged = new Set(taggedTitleIds);

  return (
    <section className="grid gap-3 rounded-lg border border-border p-4">
      <div className="grid gap-1">
        <h2 className="font-display text-base font-bold">Add a title</h2>
        <p className="text-xs text-muted-foreground">
          Searches the catalog — titles somebody has already synced.
        </p>
      </div>

      {/* A GET form, so the search term lands in the URL and the server does
          the searching. No onSubmit handler: the browser's own submission is
          exactly the navigation wanted. */}
      <form className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search the catalog"
            aria-label="Search the catalog"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" className="rounded-pill">
          Search
        </Button>
      </form>

      {query.trim() === "" ? null : results.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nothing in the catalog matches “{query.trim()}”. Only titles someone
          has synced from MyAnimeList are here.
        </p>
      ) : (
        <ul className="grid max-h-[45vh] gap-1 overflow-y-auto pr-1">
          {results.map((title) => (
            <li key={title.id}>
              <TagTitleRow
                // Keyed on whether the title already carries the tag: when the
                // server comes back with a different answer this remounts with
                // it, rather than the optimistic local state outliving the
                // refresh. Same reason CollectionToggle is keyed on its
                // membership id — syncing a ref during render instead would be
                // unsound under concurrent rendering.
                key={tagged.has(title.id) ? "on" : "off"}
                tagId={tagId}
                title={title}
                alreadyTagged={tagged.has(title.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One catalog match, as a button that tags it.
 *
 * Its own useActionState rather than one dispatcher shared by the list: a
 * single hook would carry the previous row's result into this one and fire
 * its effect on a row nobody pressed. Same reason CollectionToggle keeps two.
 */
function TagTitleRow({
  tagId,
  title,
  alreadyTagged,
}: {
  tagId: number;
  title: CollectionTitle;
  alreadyTagged: boolean;
}) {
  const router = useRouter();

  const [state, action, pending] = useActionState<TagState, FormData>(
    tagTitle,
    null,
  );

  const handled = useRef<TagState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) {
      toast.error(state.error);
    }
    // Refreshed either way, and deliberately. The likeliest error here is
    // "Already tagged.", which means the list below disagrees with what this
    // row is offering — the server's answer is what settles that. The call
    // site keys this row on whether the tag is on the title, so a refresh
    // that lands new props remounts this row with the right `alreadyTagged`
    // instead of needing local state bridged by hand here.
    router.refresh();
  }, [state, router]);

  const done = alreadyTagged || (state !== null && !state.error);

  return (
    <form action={action} className="contents">
      <input type="hidden" name="tag_id" value={tagId} />
      <input type="hidden" name="title_id" value={title.id} />
      <button
        type="submit"
        disabled={done || pending}
        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted disabled:opacity-60"
      >
        <div className="relative h-14 w-9 shrink-0 overflow-hidden rounded bg-muted">
          {title.main_picture_url ? (
            <Image
              src={title.main_picture_url}
              alt=""
              fill
              sizes="36px"
              className="object-cover"
            />
          ) : null}
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title.title}
        </span>
        {done ? (
          <Check className="size-4 shrink-0 text-brand" />
        ) : pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Plus className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
    </form>
  );
}
