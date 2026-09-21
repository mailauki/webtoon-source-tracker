"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { saveLibraryPrefs } from "@/app/actions/library-prefs";
import { Button } from "@/components/ui/button";

/**
 * The include/exclude switch for adult titles.
 *
 * A setting rather than a chip, which is why it lives here and not beside the
 * library's other filters. Those narrow one shelf for one session's worth of
 * looking; this one is a standing statement about what the app should show
 * you, and it reaches the library, the curated collections, your own
 * collections and the category pages alike.
 *
 * `aria-pressed` rather than a checkbox, the same shape the search page's
 * switch and the entry page's Edit toggle take. The icon swaps with the state
 * because the label cannot carry it: "Adult titles" names the subject in both
 * positions, so the words under it do the work of saying which way it is set.
 *
 * Real state seeded from the server value rather than useOptimistic, matching
 * <LibraryFilters> and <SearchFilters>: the save deliberately does not
 * revalidate, so no re-render brings a fresh `initial` and an optimistic value
 * would snap back to the page-load one the moment the write finished. The
 * pages this narrows are server-rendered per request, so they pick the new
 * value up on the next visit without one.
 *
 * `locked` is the age floor arriving from the server. The control is genuinely
 * disabled rather than hidden, so the reason is visible instead of the setting
 * just not being there — but the lock that matters is not this one. It is in
 * hidesMatureTitles() (lib/auth/dal.ts), which ignores the preference entirely
 * for an account that has not confirmed it is 18 or over. This prop only says
 * so; the server is what enforces it, because a disabled button is not a
 * permission check and the action behind it is its own HTTP endpoint.
 */
export function MatureContent({
  initialHidden,
  locked = false,
}: {
  initialHidden: boolean;
  /** True when the account has not confirmed it is 18 or over. */
  locked?: boolean;
}) {
  const [hidden, setHidden] = useState(initialHidden);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !hidden;
    setHidden(next);

    // Fire-and-forget behind the click, like every other preference here.
    // Losing a remembered setting is not worth interrupting a click with an
    // error, and the switch already shows where it was put.
    startTransition(async () => {
      await saveLibraryPrefs({ hideNsfw: next });
    });
  }

  // The floor, said in the switch's own terms: while it applies, what the
  // stored preference happens to be makes no difference to what is rendered,
  // so the copy must not claim otherwise.
  const effectivelyHidden = locked || hidden;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">
          {effectivelyHidden ? "Adult titles are hidden" : "Adult titles are shown"}
        </p>
        <p className="text-sm text-muted-foreground">
          {locked
            ? "Confirm you are 18 or over above to change this."
            : hidden
              ? "They stay out of your library, your collections and the category pages."
              : "Everything MyAnimeList rates as adult appears wherever it normally would."}
        </p>
      </div>

      <Button
        type="button"
        onClick={toggle}
        aria-pressed={effectivelyHidden}
        variant={effectivelyHidden ? "secondary" : "outline"}
        size="sm"
        disabled={pending || locked}
        className="rounded-pill shrink-0"
      >
        {pending ? (
          <Loader2 aria-hidden data-icon="inline-start" className="animate-spin" />
        ) : effectivelyHidden ? (
          <EyeOff aria-hidden data-icon="inline-start" />
        ) : (
          <Eye aria-hidden data-icon="inline-start" />
        )}
        {effectivelyHidden ? "Show" : "Hide"}
      </Button>
    </div>
  );
}
