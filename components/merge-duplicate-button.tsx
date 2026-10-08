"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Combine, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { mergeDuplicate, type MergeDuplicateState } from "@/app/actions/merge-duplicate";
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

/**
 * Merges an AniList-only title into the MyAnimeList title it duplicates,
 * after a confirmation. `openAfter` sends the reader to the merged entry —
 * for the AniList-only entry's own page, which the merge deletes.
 */
export function MergeDuplicateButton({
  anilistEntryId,
  malEntryId,
  anilistTitle,
  malTitle,
  openAfter = false,
}: {
  anilistEntryId: number;
  malEntryId: number;
  anilistTitle: string;
  malTitle: string;
  openAfter?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<MergeDuplicateState, FormData>(
    mergeDuplicate,
    null,
  );

  useEffect(() => {
    if (state?.ok === false) toast.error(state.error);
    if (state?.ok === true) {
      toast.success("Merged into one title.");
      if (openAfter) router.push(`/entry/${state.entryId}`);
    }
  }, [state, openAfter, router]);

  function merge() {
    const formData = new FormData();
    formData.set("anilist_entry_id", String(anilistEntryId));
    formData.set("mal_entry_id", String(malEntryId));
    startTransition(() => action(formData));
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setConfirming(true)}
        className="rounded-pill"
      >
        {pending ? (
          <Loader2 aria-hidden className="animate-spin" data-icon="inline-start" />
        ) : (
          <Combine aria-hidden data-icon="inline-start" />
        )}
        {pending ? "Merging…" : "Merge"}
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge into one title?</AlertDialogTitle>
            <AlertDialogDescription>
              “{anilistTitle}” (AniList) and “{malTitle}” (MyAnimeList) become
              one title, linked on both sites. Your sources, collections and
              tags are kept. The MyAnimeList entry&rsquo;s progress is kept.
              This can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                merge();
              }}
            >
              Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
