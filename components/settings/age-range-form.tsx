"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { declareAgeRange, type AgeState } from "@/app/actions/age";
import { Button } from "@/components/ui/button";
import { AGE_RANGES, ageRangeLabel } from "@/lib/data/age";

/**
 * The age-bracket form on /settings.
 *
 * A bracket rather than a date of birth, and a native <select> rather than the
 * Radix one — it is already a form control that lands in FormData on its own,
 * and this control's whole job is to produce FormData for declareAgeRange.
 * Same reasoning as the admin tag picker's kind field.
 *
 * What this is honest about: it is a statement by the user, not a check of
 * anything. The copy says so rather than implying a verification took place,
 * because a web page cannot verify an age and pretending otherwise would be
 * the worst of both worlds — no real assurance, and a user who believes there
 * is one. The platform APIs that could do better (Apple's Declared Age Range,
 * Google Play's age signals) read the signed-in store account through a native
 * SDK and are not reachable from a browser; lib/data/age.ts carries the
 * adapter they would land on.
 */
export function AgeRangeForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<AgeState, FormData>(
    declareAgeRange,
    null,
  );

  // `state` keeps its value for the life of the component, so without this
  // guard the effect re-fires on every following render — the same shape
  // EntryTags and CollectionCard use.
  const handled = useRef<AgeState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;

    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);

  const label = ageRangeLabel(current);

  return (
    <div className="grid gap-3 rounded-xl border border-border p-4">
      <p className="text-sm">
        {label ? (
          <>
            <Check aria-hidden className="mr-1 inline size-4 text-brand" />
            You told us you are <strong className="font-medium">{label}</strong>
            .
          </>
        ) : (
          "You have not told us your age yet."
        )}
      </p>

      <form action={action} className="flex flex-wrap items-center gap-2">
        <label htmlFor="age_range" className="sr-only">
          Your age range
        </label>
        <select
          id="age_range"
          name="age_range"
          // Keyed on the stored value so the select resets to it after a save,
          // rather than an uncontrolled DOM select holding the old choice.
          key={current ?? "none"}
          defaultValue={current ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Choose an age range…
          </option>
          {AGE_RANGES.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>

        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending}
          className="rounded-pill"
        >
          {pending ? (
            <Loader2 aria-hidden data-icon="inline-start" className="animate-spin" />
          ) : null}
          {label ? "Update" : "Confirm"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        This is what you tell us, not something we check. It decides whether
        adult titles can be shown to you at all.
      </p>
    </div>
  );
}
