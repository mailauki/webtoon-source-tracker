"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  disconnectAniList,
  type AniListConnectionState,
} from "@/app/actions/anilist-connection";
import { Button } from "@/components/ui/button";

/**
 * The Disconnect button beside AniList on /settings.
 *
 * No confirmation step, unlike the account sync: disconnecting deletes nothing
 * on either site and nothing in the library, and reconnecting restores it.
 */
export function AniListDisconnect() {
  const [state, action, pending] = useActionState<AniListConnectionState, FormData>(
    disconnectAniList,
    null,
  );

  // Same guard as AgeRangeForm: `state` persists, so the toast must fire once.
  const handled = useRef<AniListConnectionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action}>
      <Button
        type="submit"
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
    </form>
  );
}
