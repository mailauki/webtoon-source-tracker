"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import {
  addAniListEntry,
  type AddAniListEntryState,
} from "@/app/actions/add-anilist-entry";
import { addEntry, type AddEntryState } from "@/app/actions/add-entry";
import { Button } from "@/components/ui/button";

/**
 * "Add to library", for a catalog title the viewer does not track.
 *
 * Lifted out of CollectionCard when the card was unified: the button is the
 * only thing a discover card does that a library card does not, and keeping it
 * here means the card itself does not import a server action for a branch most
 * of its renders never take.
 *
 * `compact` is the icon-only form for the row layout, where the button sits in
 * the same trailing slot the read-through link occupies on a tracked row and
 * has no width for a label.
 *
 * A title MyAnimeList does not have (`malMediaId` null) is added through
 * AniList instead — a different action with a different source of truth, see
 * app/actions/add-anilist-entry.ts — and that needs a connected AniList
 * account, so without one the button becomes the way to connect it, as on
 * the search page.
 */
export function AddTitleButton({
  malMediaId,
  anilistMediaId = null,
  anilistConnected = false,
  name,
  compact = false,
}: {
  malMediaId: number | null;
  /**
   * AniList's id for the title, when the caller already knows it. With a MAL
   * id it is only a head start for the mirror (see addEntry); without one it
   * is the title.
   */
  anilistMediaId?: number | null;
  /** Whether an AniList-only title can be added, rather than only connected. */
  anilistConnected?: boolean;
  /** For the accessible name — an icon-only button has nothing else to say. */
  name: string;
  compact?: boolean;
}) {
  const router = useRouter();

  // The action revalidates /library, and router.refresh() below re-renders the
  // page — but the refreshed props only arrive after a round trip, and the
  // button has to stop saying "Add" the moment the add succeeds.
  const [added, setAdded] = useState(false);
  // Both wired up unconditionally, because hooks cannot be called behind a
  // branch; only the one matching the title is ever submitted.
  const [malState, malAction, malPending] = useActionState<
    AddEntryState,
    FormData
  >(addEntry, null);
  const [anilistState, anilistAction, anilistPending] = useActionState<
    AddAniListEntryState,
    FormData
  >(addAniListEntry, null);

  const anilistOnly = malMediaId === null;
  const state = anilistOnly ? anilistState : malState;
  const action = anilistOnly ? anilistAction : malAction;
  const pending = anilistOnly ? anilistPending : malPending;

  // `state` keeps its successful value for the life of the component, so
  // without this guard the effect re-fires on every following render — and
  // since it calls router.refresh(), which causes another render, that is a
  // loop rather than a stray extra call.
  const handled = useRef(false);

  useEffect(() => {
    if (!state?.ok || handled.current) return;
    handled.current = true;
    setAdded(true);
    router.refresh();
  }, [state, router]);

  // The refresh will re-render this card as a tracked one. Until it lands the
  // button is gone rather than still offering an add that already happened.
  if (added) return null;

  // Nothing to add with: an AniList-only title needs an AniList account, and
  // with no id on either site there is no title to name at all.
  if (anilistOnly && (anilistMediaId === null || !anilistConnected)) {
    if (anilistMediaId === null) return null;
    return (
      <Link
        href="/api/anilist/connect"
        className="block text-center text-[10px] leading-tight text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Connect AniList to add
      </Link>
    );
  }

  return (
    <>
      <form action={action}>
        {anilistOnly ? null : (
          <input type="hidden" name="mal_media_id" value={malMediaId} />
        )}
        {/* With a MAL id this is the mirror's head start, and empty reads as
            "no id" rather than "clear the one on file"; without one it is the
            title being added. */}
        <input type="hidden" name="anilist_media_id" value={anilistMediaId ?? ""} />
        {/* Discovery adds a title to read later, never one in progress. */}
        <input type="hidden" name="list_status" value="plan_to_read" />
        <Button
          type="submit"
          size={compact ? "icon" : "sm"}
          variant="outline"
          disabled={pending}
          aria-label={compact ? `Add ${name} to library` : undefined}
          className={
            compact
              ? "size-8 rounded-full pointer-coarse:size-10"
              : "w-full rounded-pill text-xs"
          }
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {compact ? null : "Add"}
        </Button>
      </form>

      {state && !state.ok ? (
        <p role="alert" className="px-0.5 text-xs text-alert">
          {state.error}
        </p>
      ) : null}
    </>
  );
}
