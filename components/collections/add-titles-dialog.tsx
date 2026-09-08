"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import {
  addToCollection,
  type CollectionState,
} from "@/app/actions/collections";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { LibraryTitle } from "@/lib/data/collections";

/**
 * Adds titles from the viewer's library to one of their collections.
 *
 * The picker only offers what is already in the library. Adding something the
 * viewer does not track is a different gesture with a different cost — it
 * writes to MyAnimeList — and it already has its own home on /discover.
 *
 * Filtering happens in the browser over rows the page already sent, the same
 * reasoning as the library grid: every field the search narrows on is
 * present, so a keystroke should not cost a round trip.
 */
export function AddTitlesDialog({
  collectionId,
  library,
  presentTitleIds,
}: {
  collectionId: number;
  library: LibraryTitle[];
  /** Catalog ids already in this collection — offering them would only fail. */
  presentTitleIds: number[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Added in this session. The server revalidates, but the dialog stays open
  // across adds and its list would otherwise still offer them.
  const [added, setAdded] = useState<Set<number>>(new Set());

  const [state, action, pending] = useActionState<CollectionState, FormData>(
    async (prev, formData) => {
      const result = await addToCollection(prev, formData);
      if (result?.error) toast.error(result.error);
      else setAdded((prev) => new Set(prev).add(Number(formData.get("title_id"))));
      return result;
    },
    null,
  );

  const present = useMemo(
    () => new Set(presentTitleIds),
    [presentTitleIds],
  );

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return library.filter((row) => {
      if (present.has(row.media_titles.id)) return false;
      if (!term) return true;
      return row.media_titles.title.toLowerCase().includes(term);
    });
  }, [library, present, query]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="rounded-pill"
      >
        <Plus className="size-4" />
        Add titles
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Add titles</DialogTitle>
            <DialogDescription>
              Anything in your library can go in this collection.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your library"
              aria-label="Search your library"
              className="pl-9"
            />
          </div>

          {matches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {library.length === 0
                ? "Your library is empty — sync MyAnimeList first."
                : query.trim()
                  ? `Nothing in your library matches “${query.trim()}”.`
                  : "Everything in your library is already in this collection."}
            </p>
          ) : (
            <ul className="grid max-h-[45vh] gap-1 overflow-y-auto pr-1">
              {matches.map((row) => {
                const title = row.media_titles;
                const done = added.has(title.id);

                return (
                  <li key={row.id}>
                    <form action={action} className="contents">
                      <input
                        type="hidden"
                        name="collection_id"
                        value={collectionId}
                      />
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
                  </li>
                );
              })}
            </ul>
          )}

          {state?.error ? (
            <p role="alert" className="text-sm text-alert">
              {state.error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
