"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { SyncProgressBar } from "@/components/sync-progress";
import { Button } from "@/components/ui/button";
import type { SyncProgress } from "@/lib/sync/progress";
import { readSyncEvents } from "@/lib/sync/read-sync-events";
import type { RefreshEvent } from "@/lib/sync/refresh-library";

/**
 * Refresh library: brings changes made on MyAnimeList and AniList in.
 *
 * Named for what it does rather than "Sync", because it only ever reads from
 * the two sites. Writing the library out to them is a separate action on
 * /settings ("Copy between sites"), behind a confirmation, and the two used
 * to share a word that hid the difference.
 *
 * Deliberately quiet at rest: a ghost button that reads as the shelf's
 * last-synced time, with a dot when a refresh is due, so it sits beside the
 * title instead of competing with the covers. While it runs it shows the same
 * progress bar as Copy between sites, fed by /api/library-refresh as the
 * pulls move; what the run did arrives as a toast.
 */
export function SyncButton({
  lastSyncedLabel,
  stale,
}: {
  lastSyncedLabel: string;
  stale: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const running = useRef(false);
  const pending = progress !== null;

  async function run() {
    // A ref, not `pending`: a double click lands before the state update does.
    if (running.current) return;
    running.current = true;
    setProgress({ step: "Starting", value: 0 });

    let finished = false;
    const fail = (message: string) => {
      finished = true;
      toast.error(message);
    };

    try {
      const response = await fetch("/api/library-refresh", { method: "POST" });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        fail(body?.error ?? "The refresh could not start. Please try again.");
        return;
      }

      await readSyncEvents<RefreshEvent>(response.body, (event) => {
        if (event.type === "progress") {
          setProgress({ step: event.step, value: event.value });
        } else if (event.type === "done") {
          finished = true;
          toast.success(event.message);
        } else {
          fail(event.error);
        }
      });

      // The stream closed without a last word: the server ran out of time.
      // What was pulled stays pulled, and the next refresh carries on.
      if (!finished) {
        fail("The refresh was cut off before it finished. Run it again to continue.");
      }
    } catch {
      if (!finished) fail("The connection dropped during the refresh. Run it again to continue.");
    } finally {
      running.current = false;
      setProgress(null);
      // Picks up the new shelf, the last-synced time, and any connection
      // that expired mid-run.
      router.refresh();
    }
  }

  return (
    <div className="grid justify-items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => void run()}
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

      {progress ? (
        <SyncProgressBar
          label="Refresh progress"
          progress={progress}
          className="w-64 max-w-full"
        />
      ) : null}
    </div>
  );
}
