"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { UnmatchedTitles } from "@/components/settings/unmatched-titles";
import { SyncProgressBar } from "@/components/sync-progress";
import { readSyncEvents } from "@/lib/sync/read-sync-events";
import type {
  AccountSyncProgress,
  SyncDirection,
  UnmatchedTitle,
} from "@/lib/sync/plan-account-sync";

const DIRECTIONS: {
  value: SyncDirection;
  label: string;
  title: string;
  confirm: string;
}[] = [
  {
    value: "two_way",
    label: "Both ways — newest edit wins",
    title: "Copy both ways?",
    confirm:
      "Each title is compared on both sites, and whichever was edited more recently is copied to the other. Titles on only one site are added to the other.",
  },
  {
    value: "mal_to_anilist",
    label: "MyAnimeList → AniList",
    title: "Copy MyAnimeList to AniList?",
    confirm:
      "Your MyAnimeList list is copied onto AniList. Where the two disagree, AniList is overwritten.",
  },
  {
    value: "anilist_to_mal",
    label: "AniList → MyAnimeList",
    title: "Copy AniList to MyAnimeList?",
    confirm:
      "Your AniList list is copied onto MyAnimeList. Where the two disagree, MyAnimeList is overwritten.",
  },
];

/**
 * "Copy between sites": the MyAnimeList <-> AniList sync on /settings.
 *
 * Named apart from the library's "Refresh library" on purpose. The two used
 * to both be "Sync", which hid the one difference that matters: Refresh only
 * reads from the sites, and this writes to them.
 *
 * Confirmed through an AlertDialog before it runs: unlike Refresh library,
 * which only reads, this writes to two accounts the app does not own,
 * and an overwrite there has no undo. The dialog says which side can be
 * overwritten for the direction picked, and that nothing is ever deleted.
 *
 * The run itself streams from /api/account-sync, which reports how far it has
 * got as it goes; that drives the progress bar. Titles the run could not pair
 * between the two sites are listed underneath, from the last run until the
 * next one replaces them.
 */
export function AccountSync({
  lastSyncedLabel,
  unmatchedTitles: initialUnmatched,
}: {
  lastSyncedLabel: string;
  unmatchedTitles: UnmatchedTitle[];
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<SyncDirection>("two_way");
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<AccountSyncProgress | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState(initialUnmatched);
  const running = useRef(false);

  const pending = progress !== null;
  const chosen = DIRECTIONS.find((d) => d.value === direction) ?? DIRECTIONS[0];

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
      const response = await fetch("/api/account-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        fail(body?.error ?? "The copy could not start. Please try again.");
        return;
      }

      await readSyncEvents(response.body, (event) => {
        if (event.type === "progress") {
          setProgress({ step: event.step, value: event.value });
        } else if (event.type === "done") {
          finished = true;
          setSummary(event.message);
          setUnmatched(event.result.unmatchedTitles);
          toast.success("MyAnimeList and AniList copied.");
        } else {
          fail(event.error);
        }
      });

      // The stream closed without a last word: the server ran out of time.
      // Whatever was written stays written, and the next run carries on.
      if (!finished) {
        fail("The copy was cut off before it finished. Run it again to continue.");
      }
    } catch {
      if (!finished) fail("The connection dropped during the copy. Run it again to continue.");
    } finally {
      running.current = false;
      setProgress(null);
      // Picks up what the run changed elsewhere on the page — a connection
      // that expired mid-run, the last-synced time.
      router.refresh();
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="sync_direction" className="sr-only">
          Sync direction
        </label>
        <select
          id="sync_direction"
          name="direction"
          value={direction}
          onChange={(event) => setDirection(event.target.value as SyncDirection)}
          disabled={pending}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setConfirming(true)}
          className="rounded-pill"
        >
          {pending ? (
            <Loader2 aria-hidden data-icon="inline-start" className="animate-spin" />
          ) : (
            <ArrowLeftRight aria-hidden data-icon="inline-start" />
          )}
          {pending ? "Copying…" : "Copy between sites"}
        </Button>
      </div>

      {progress ? (
        <SyncProgressBar label="Copy progress" progress={progress} />
      ) : (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {summary ?? lastSyncedLabel}
        </p>
      )}

      <UnmatchedTitles titles={unmatched} />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{chosen.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {chosen.confirm} Nothing is deleted from either site.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                void run();
              }}
            >
              Copy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
