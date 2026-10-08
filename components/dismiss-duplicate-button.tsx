"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { dismissDuplicate, type DismissDuplicateState } from "@/app/actions/dismiss-duplicate";
import { Button } from "@/components/ui/button";

/** "Not a duplicate": takes a suggested pair out of the user's list. */
export function DismissDuplicateButton({
  anilistTitleId,
  malTitleId,
}: {
  anilistTitleId: number;
  malTitleId: number;
}) {
  const [state, action, pending] = useActionState<DismissDuplicateState, FormData>(
    dismissDuplicate,
    null,
  );

  useEffect(() => {
    if (state?.ok === false) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="anilist_title_id" value={anilistTitleId} />
      <input type="hidden" name="mal_title_id" value={malTitleId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending} className="rounded-pill">
        {pending ? "Dismissing…" : "Not a duplicate"}
      </Button>
    </form>
  );
}
