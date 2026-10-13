"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
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
 *
 * It also refreshes on its own once `dueAt` has passed: on opening the
 * library, on coming back to the tab, and when a tab left open reaches it.
 * Those runs are quiet — the button spins, but there is no progress bar and no
 * toast, since the user did not ask and the shelf updating says enough. A run
 * that fails leaves the dot up and is not retried until the page is opened
 * again, so a site that is down is not asked over and over. Writing out to the
 * sites ("Copy between sites") is never automatic: it can overwrite an
 * account the app does not own, so it stays behind its confirmation.
 */
export function SyncButton({
  lastSyncedLabel,
  stale,
  dueAt = null,
}: {
  lastSyncedLabel: string;
  stale: boolean;
  /** Epoch ms after which a refresh runs by itself; null never. */
  dueAt?: number | null;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  // Only a press shows the bar; a background run just spins the icon.
  const [quiet, setQuiet] = useState(false);
  const running = useRef(false);
  // The due time already tried in the background, so a failed run is not
  // repeated on every tab switch. A successful one moves `dueAt` on.
  const attempted = useRef<number | null>(null);
  const pending = progress !== null;

  async function run(auto = false) {
    // A ref, not `pending`: a double click lands before the state update does.
    if (running.current) return;
    running.current = true;
    setQuiet(auto);
    setProgress({ step: "Starting", value: 0 });

    let finished = false;
    const fail = (message: string) => {
      finished = true;
      if (!auto) toast.error(message);
    };

    try {
      const response = await fetch(
        "/api/library-refresh",
        auto
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ auto: true }),
            }
          : { method: "POST" },
      );

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
          if (!auto) toast.success(event.message);
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

  const refreshInBackground = useEffectEvent(() => {
    if (dueAt === null || Date.now() <= dueAt) return;
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    if (attempted.current === dueAt) return;
    attempted.current = dueAt;
    void run(true);
  });

  useEffect(() => {
    if (dueAt === null) return;

    // Effect events are called, never handed on, so the listeners wrap it.
    const wake = () => refreshInBackground();
    wake();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    // A tab left open on the library comes due too. Capped at setTimeout's
    // limit (about 24 days); a page open that long gets a fresh dueAt anyway.
    const timer = window.setTimeout(
      wake,
      Math.min(Math.max(0, dueAt - Date.now()) + 1_000, 2_147_483_647),
    );

    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.clearTimeout(timer);
    };
  }, [dueAt]);

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

      {progress && !quiet ? (
        <SyncProgressBar
          label="Refresh progress"
          progress={progress}
          className="w-64 max-w-full"
        />
      ) : null}
    </div>
  );
}
