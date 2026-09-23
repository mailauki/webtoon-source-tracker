"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  disconnectMal,
  type MalConnectionState,
} from "@/app/actions/mal-connection";
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
 * The Disconnect button beside MyAnimeList on /settings.
 *
 * Confirmed, unlike AniListDisconnect. The two are not symmetric: the library
 * mirrors MyAnimeList, so severing it is what turns the shelf read-only, and
 * the dialog is where that gets said. Nothing is deleted either way — see
 * disconnectMal, which deliberately keeps user_entries and entry_sources.
 */
export function MalDisconnect() {
  const [state, action, pending] = useActionState<MalConnectionState, FormData>(
    disconnectMal,
    null,
  );

  // Same guard as AniListDisconnect: `state` persists, so the toast fires once.
  const handled = useRef<MalConnectionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          className="rounded-pill"
        >
          {pending ? (
            <Loader2 aria-hidden data-icon="inline-start" className="animate-spin" />
          ) : null}
          Disconnect
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect MyAnimeList?</AlertDialogTitle>
          <AlertDialogDescription>
            Your library and the sources you assigned stay exactly as they are,
            and nothing on MyAnimeList is touched — but syncing stops until you
            reconnect. Searching its catalog keeps working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={action}>
            <AlertDialogAction type="submit">Disconnect</AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
