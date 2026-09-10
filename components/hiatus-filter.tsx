"use client";

import { PauseCircle } from "lucide-react";

import { useLibraryFilters } from "@/components/library-grid";
import { Button } from "./ui/button";

/**
 * The "hide hiatus" toggle, sharing the header's secondary row with the sort
 * menu.
 *
 * It sits beside the sort control rather than in the source chip row because
 * it is not a chip: the chips are one-of-many, where picking Webtoon replaces
 * No source, while this narrows whatever they already select. Grouping it with
 * the chips implied it was another one of them.
 *
 * Phrased as what clicking does ("Hide hiatus") rather than as a state, since
 * it is off by default and an unpressed control naming its own effect is
 * easier to read than one naming the state it would leave.
 *
 * Styled to match SortFilter's trigger — same pill, border, and translucent
 * ground — so the two read as one cluster of grid controls.
 *
 * The pressed state is deliberately quiet: a muted ground and a foreground
 * label, not the cyan→blue gradient the status and source chips use. Those
 * chips answer "which slice of the shelf am I looking at", which is the
 * question the loud treatment is there to answer; this only removes a handful
 * of paused titles from whatever they already select. Giving it the same
 * gradient made a secondary control compete with the primary ones for the
 * eye. The filled icon and the border carry the state instead.
 */
export function HiatusFilter() {
  const { hideHiatus, setHideHiatus, pending } = useLibraryFilters();

  return (
		<Button
      onClick={() => setHideHiatus(!hideHiatus)}
      aria-pressed={hideHiatus}
			variant={hideHiatus ? "secondary" : "outline"}
			className="rounded-full"
			disabled={pending}
		>
			{/* {pending && <Spinner data-icon="inline-start" />} */}
			<PauseCircle aria-hidden data-icon="inline-start" />
      {/* The label follows the sort trigger's responsive pattern: the icon
          carries it on a phone, where the row is tightest. */}
      <span className="max-sm:sr-only">Hide hiatus</span>
		</Button>
  );
}
