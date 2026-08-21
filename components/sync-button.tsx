"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, RefreshCw } from "lucide-react";

import { runSync, type SyncState } from "@/app/actions/sync";
import { Button } from "@/components/ui/button";

function SubmitButton({ stale }: { stale: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      className={
        stale
          ? "rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
          : "rounded-pill"
      }
      variant={stale ? "default" : "outline"}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      {pending ? "Syncing…" : "Sync"}
    </Button>
  );
}

export function SyncButton({
  lastSyncedLabel,
  stale,
}: {
  lastSyncedLabel: string;
  stale: boolean;
}) {
  const [state, action] = useActionState<SyncState, FormData>(runSync, null);

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm text-muted-foreground">{lastSyncedLabel}</p>
        {state?.ok === false ? (
          <p role="alert" className="text-xs text-alert">
            {state.error}
          </p>
        ) : null}
        {state?.ok === true ? (
          <p className="text-xs text-muted-foreground">{state.message}</p>
        ) : null}
      </div>

      <form action={action}>
        {/* An explicit click means "sync now", so bypass the staleness gate. */}
        <input type="hidden" name="force" value="1" />
        <SubmitButton stale={stale} />
      </form>
    </div>
  );
}
