"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { runAccountSync, type AccountSyncState } from "@/app/actions/account-sync";
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
import type { SyncDirection } from "@/lib/sync/plan-account-sync";

const DIRECTIONS: {
  value: SyncDirection;
  label: string;
  title: string;
  confirm: string;
}[] = [
  {
    value: "two_way",
    label: "Both ways — newest edit wins",
    title: "Sync both ways?",
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
 * The MyAnimeList <-> AniList sync on /settings.
 *
 * Confirmed through an AlertDialog before it runs: unlike the library's Sync
 * button, which only reads, this writes to two accounts the app does not own,
 * and an overwrite there has no undo. The dialog says which side can be
 * overwritten for the direction picked, and that nothing is ever deleted.
 *
 * Native <select> for the same reason AgeRangeForm uses one — it lands in
 * FormData on its own — with the value mirrored into state so the dialog can
 * describe the choice.
 */
export function AccountSync({ lastSyncedLabel }: { lastSyncedLabel: string }) {
  const [state, action, pending] = useActionState<AccountSyncState, FormData>(
    runAccountSync,
    null,
  );
  const [direction, setDirection] = useState<SyncDirection>("two_way");
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handled = useRef<AccountSyncState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.ok) toast.success("Accounts synced.");
    else toast.error(state.error);
  }, [state]);

  const chosen = DIRECTIONS.find((d) => d.value === direction) ?? DIRECTIONS[0];

  return (
    <div className="grid gap-3 rounded-xl border border-border p-4">
      <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
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
          {pending ? "Syncing…" : "Sync accounts"}
        </Button>
      </form>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {state?.ok ? state.message : lastSyncedLabel}
      </p>

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
                formRef.current?.requestSubmit();
              }}
            >
              Sync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
