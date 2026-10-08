"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import {
  reviewCollectionSuggestion,
  reviewTagSuggestion,
  type SuggestionState,
} from "@/app/actions/suggestions";
import { Button } from "@/components/ui/button";

/**
 * One pending suggestion with Approve and Reject.
 *
 * Both buttons submit the same form; the pressed one's name/value lands in
 * FormData as `decision`. Its own useActionState per row, so a result toasts
 * against the row that was pressed (the same reason TaggedTitleRow keeps its
 * own).
 */
export function SuggestionReview({
  kind,
  id,
  children,
}: {
  kind: "tag" | "collection";
  id: number;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [state, action, pending] = useActionState<SuggestionState, FormData>(
    kind === "tag" ? reviewTagSuggestion : reviewCollectionSuggestion,
    null,
  );

  const handled = useRef<SuggestionState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) {
      toast.error(state.error);
      return;
    }
    if (state.message) toast.success(state.message);
    router.refresh();
  }, [state, router]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1">{children}</div>
      <form action={action} className="flex shrink-0 gap-1">
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          name="decision"
          value="approve"
          size="sm"
          variant="outline"
          disabled={pending}
          className="rounded-pill"
        >
          <Check data-icon="inline-start" />
          Approve
        </Button>
        <Button
          type="submit"
          name="decision"
          value="reject"
          size="sm"
          variant="ghost"
          disabled={pending}
          className="rounded-pill text-muted-foreground hover:text-alert"
        >
          <X data-icon="inline-start" />
          Reject
        </Button>
      </form>
    </div>
  );
}
