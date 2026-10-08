"use client";

import { useActionState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { runSync, type SyncState } from "@/app/actions/sync";
import { Button } from "@/components/ui/button";

/**
 * Refresh library: brings changes made on MyAnimeList and AniList in.
 *
 * Named for what it does rather than "Sync", because it only ever reads from
 * the two sites. Writing the library out to them is a separate action on
 * /settings ("Copy between sites"), behind a confirmation, and the two used
 * to share a word that hid the difference.
 *
 * Deliberately quiet: a ghost button that reads as the shelf's last-synced
 * time, with a dot when a refresh is due, so it sits beside the title instead
 * of competing with the covers. What a run did arrives as a toast rather
 * than as text that pushes the header around.
 */
export function SyncButton({
  lastSyncedLabel,
  stale,
}: {
  lastSyncedLabel: string;
  stale: boolean;
}) {
  const [state, action, pending] = useActionState<SyncState, FormData>(
    runSync,
    null,
  );

  // Each run returns a new state object, so this fires once per press.
  useEffect(() => {
    if (state?.ok === true) toast.success(state.message);
    if (state?.ok === false) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      {/* An explicit click means "refresh now", so bypass the staleness gate. */}
      <input type="hidden" name="force" value="1" />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Refresh library. ${lastSyncedLabel}${
          stale ? ", due for a refresh" : ""
        }.`}
        title="Bring in changes from MyAnimeList and AniList"
        className="rounded-full font-normal text-muted-foreground"
      >
        {pending ? (
          <Loader2 aria-hidden className="animate-spin" data-icon="inline-start" />
        ) : (
          <span className="relative" data-icon="inline-start">
            <RefreshCw aria-hidden className="size-4" />
            {stale ? (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand ring-2 ring-background"
              />
            ) : null}
          </span>
        )}
        {pending ? "Refreshing…" : lastSyncedLabel}
      </Button>
    </form>
  );
}
