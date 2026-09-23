"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  removeEntry,
  restoreEntry,
  type RemoveEntryState,
} from "@/app/actions/remove-entry";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Removing a title, from the library and/or from the sites it came from.
 *
 * Three separate choices rather than one button, because they differ in how
 * reversible they are. Removing from the library archives the row — the
 * hand-entered sources survive and it can be restored — while removing from
 * MyAnimeList or AniList is a real delete on a list this app does not own.
 * Only the reversible one is on by default.
 *
 * The dialog says which of the two sites actually has this title, since the
 * answer differs per row now that the catalog holds AniList-only entries.
 */
export function EntryRemove({
  entryId,
  title,
  onMal,
  onAniList,
  archived,
}: {
  entryId: number;
  title: string;
  onMal: boolean;
  onAniList: boolean;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState<RemoveEntryState, FormData>(
    removeEntry,
    null,
  );
  const [restoreState, restoreAction, restoring] = useActionState<
    RemoveEntryState,
    FormData
  >(restoreEntry, null);
  // Same guard the other action components use: `state` persists, so the
  // toast must fire once per result rather than on every render.
  const handled = useRef<RemoveEntryState>(null);

  useEffect(() => {
    const latest = state ?? restoreState;
    if (!latest || handled.current === latest) return;
    handled.current = latest;

    if (latest.ok) toast.success(latest.message);
    else toast.error(latest.error);
  }, [state, restoreState]);

  if (archived) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
        <p className="text-sm text-muted-foreground">
          You removed this title. Its sources are still saved.
        </p>
        <form action={restoreAction}>
          <input type="hidden" name="entry_id" value={entryId} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={restoring}
            className="rounded-pill"
          >
            {restoring ? (
              <Loader2 aria-hidden data-icon="inline-start" className="animate-spin" />
            ) : null}
            Put it back
          </Button>
        </form>
      </div>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-fit rounded-pill text-alert hover:text-alert"
        >
          <Trash2 aria-hidden data-icon="inline-start" />
          Remove
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Choose where to remove it from. Taking it out of your library keeps
            the sources you saved and can be undone; removing it from a site
            cannot.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={action} className="grid gap-3">
          <input type="hidden" name="entry_id" value={entryId} />

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="from_library"
              defaultChecked
              className="mt-0.5 size-4 accent-brand"
            />
            <span>
              From my library
              <span className="block text-xs text-muted-foreground">
                Hides it here. Sources are kept and it can be restored.
              </span>
            </span>
          </label>

          {onMal ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="from_mal"
                className="mt-0.5 size-4 accent-alert"
              />
              <span>
                From MyAnimeList
                <span className="block text-xs text-muted-foreground">
                  Deletes it from your MyAnimeList list. Can&rsquo;t be undone.
                </span>
              </span>
            </label>
          ) : null}

          {onAniList ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="from_anilist"
                className="mt-0.5 size-4 accent-alert"
              />
              <span>
                From AniList
                <span className="block text-xs text-muted-foreground">
                  Deletes it from your AniList list. Can&rsquo;t be undone.
                </span>
              </span>
            </label>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            {/* AlertDialogAction closes the dialog on click; `asChild` keeps
                the real submit button inside the form so the action still
                runs. The result is reported by the toast rather than by the
                dialog staying open. */}
            <AlertDialogAction asChild>
              {/* Exactly one child: Radix's asChild clones it, and more than
                  one would throw. The spinner lives inside the button. */}
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-pill bg-alert px-4 text-sm font-bold text-white hover:bg-alert/90 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : null}
                Remove
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
