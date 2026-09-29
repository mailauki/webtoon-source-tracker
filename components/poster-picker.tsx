"use client";

import { useActionState, useId, useState } from "react";
import { ImageIcon, Link2 } from "lucide-react";
import { toast } from "sonner";

import { setEntryCover, type EntryCoverState } from "@/app/actions/entry-cover";
import { SubmitButton } from "@/components/auth/submit-button";
import { CoverImage } from "@/components/cover-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isPosterUrl,
  POSTER_SOURCE_LABELS,
  type PosterOption,
} from "@/lib/data/entry-cover";

/** The radio value for the catalog's cover, which saves as a reset. */
const DEFAULT = "";
/** The radio value for the pasted link. Not a URL, so it cannot collide. */
const CUSTOM = "custom";

/**
 * Choosing which poster a title wears, on its cards and on this page.
 *
 * A grid of every poster the two sites have for it, plus a link the reader can
 * paste. The catalog's own cover is always first and saves as a reset rather
 * than as a copy of its URL, so a title left on the default keeps following
 * the catalog when a sync brings it a new cover.
 *
 * Only on the entry page, and only for a tracked title: the choice is kept on
 * the reader's own `user_entries` row, which a catalog title has none of.
 */
export function PosterPicker({
  entryId,
  title,
  catalog,
  current,
  options,
}: {
  entryId: number;
  /** The heading, for the dialog and the stand-in when there is no image. */
  title: string;
  /** The catalog's cover — what "Default" shows and resets to. */
  catalog: string | null;
  /** The reader's saved choice, or null when they are on the default. */
  current: string | null;
  /** Every alternative on offer. See posterOptions. */
  options: PosterOption[];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Closed from the action rather than from an effect watching its result:
  // the dialog and the toast answer this submit, not a re-render.
  const [state, action] = useActionState<EntryCoverState, FormData>(
    async (prev, formData) => {
      const next = await setEntryCover(prev, formData);
      if (next?.ok) {
        toast.success(next.message);
        setOpen(false);
      }
      return next;
    },
    null,
  );

  const alternatives = options.filter((option) => option.source !== "catalog");
  const initial = current ?? DEFAULT;
  const [choice, setChoice] = useState(initial);
  const [link, setLink] = useState("");

  function onOpenChange(next: boolean) {
    // Each opening starts from what is saved, not from an abandoned edit.
    if (next) {
      setChoice(initial);
      setLink("");
    }
    setOpen(next);
  }

  const value = choice === CUSTOM ? link.trim() : choice;
  const linkReady = isPosterUrl(link.trim());

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label={`Change poster for ${title}`}
        title="Change poster"
        className="absolute right-2 bottom-2 inline-flex size-8 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur-sm transition-colors hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background pointer-coarse:size-10"
      >
        <ImageIcon className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Poster</DialogTitle>
            <DialogDescription>
              Pick the art {title} shows on your shelf. Only you see it.
            </DialogDescription>
          </DialogHeader>

          <form action={action} className="grid gap-4">
            <input type="hidden" name="entry_id" value={entryId} />
            <input type="hidden" name="cover_url" value={value} />

            <fieldset className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
              <legend className="sr-only">Posters</legend>

              <PosterTile
                name={`${id}-poster`}
                value={DEFAULT}
                label={POSTER_SOURCE_LABELS.catalog}
                src={catalog}
                title={title}
                checked={choice === DEFAULT}
                onSelect={setChoice}
              />
              {alternatives.map((option) => (
                <PosterTile
                  key={option.url}
                  name={`${id}-poster`}
                  value={option.url}
                  label={POSTER_SOURCE_LABELS[option.source]}
                  detail={ordinal(alternatives, option)}
                  src={option.url}
                  title={title}
                  checked={choice === option.url}
                  onSelect={setChoice}
                />
              ))}
              <PosterTile
                name={`${id}-poster`}
                value={CUSTOM}
                label="Your link"
                src={linkReady ? link.trim() : null}
                title={title}
                checked={choice === CUSTOM}
                onSelect={setChoice}
                empty
              />
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor={`${id}-link`}>Image link</Label>
              <Input
                id={`${id}-link`}
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://…"
                maxLength={2048}
                value={link}
                onChange={(event) => {
                  setLink(event.target.value);
                  setChoice(CUSTOM);
                }}
                aria-invalid={choice === CUSTOM && link !== "" && !linkReady}
              />
              <p className="text-xs text-muted-foreground">
                Paste a link to any image that starts with https://.
              </p>
            </div>

            {state && !state.ok ? (
              <p role="alert" className="text-sm text-alert">
                {state.error}
              </p>
            ) : null}

            <DialogFooter>
              {/* Nothing to save when the choice is already what is stored,
                  or the link is not one the server would take. */}
              {choice === initial ||
              (choice === CUSTOM && !linkReady) ? null : (
                <SubmitButton className="rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90">
                  Save poster
                </SubmitButton>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * "2 of 5" among the posters from the same site, so a screen reader can tell
 * one MyAnimeList poster from the next. Nothing when the site offers only one.
 */
function ordinal(options: PosterOption[], option: PosterOption) {
  const same = options.filter((other) => other.source === option.source);
  if (same.length < 2) return undefined;
  return `${same.indexOf(option) + 1} of ${same.length}`;
}

/**
 * One choice in the grid: a real radio, so arrow keys move between posters
 * and a screen reader announces the group, drawn as the poster itself.
 */
function PosterTile({
  name,
  value,
  label,
  detail,
  src,
  title,
  checked,
  onSelect,
  empty = false,
}: {
  name: string;
  value: string;
  label: string;
  detail?: string;
  src: string | null;
  title: string;
  checked: boolean;
  onSelect: (value: string) => void;
  /** The link tile: an icon rather than the title until a link is pasted. */
  empty?: boolean;
}) {
  return (
    <label className="group grid cursor-pointer gap-1">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="peer sr-only"
        aria-label={detail ? `${label}, ${detail}` : label}
      />
      <span className="relative block aspect-[9/16] overflow-hidden rounded-lg bg-muted ring-offset-2 ring-offset-popover transition-shadow peer-checked:ring-3 peer-checked:ring-brand peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
        {empty && !src ? (
          <span className="flex h-full items-center justify-center">
            <Link2 className="size-5 text-muted-foreground/70" aria-hidden />
          </span>
        ) : (
          <CoverImage
            src={src}
            title={title}
            sizes="120px"
            className="object-cover object-top"
          />
        )}
      </span>
      <span className="truncate text-center text-xs text-muted-foreground peer-checked:font-semibold peer-checked:text-foreground">
        {label}
      </span>
    </label>
  );
}
