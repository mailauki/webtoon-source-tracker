"use client";

import { BookmarkCheck } from "lucide-react";

import { useLibraryFilters } from "@/components/library-grid";
import { Button } from "./ui/button";

/**
 * The "owned only" toggle, sharing the header's secondary row with the sort
 * menu and the hiatus toggle.
 *
 * Sits beside those rather than in the source chip row for the same reason
 * HiatusFilter does: the chips are one-of-many, where picking Webtoon
 * replaces No source, while this narrows whatever they already select.
 *
 * Phrased as a state ("Owned only") rather than as an action, which is the
 * opposite of the hiatus toggle's "Hide hiatus" — and deliberate. A label
 * naming its own effect works when the effect is a removal, because "Hide
 * hiatus" is a complete sentence about what the click does. The positive
 * version of that would be "Show only owned", which is longer, and on a phone
 * the label is the first thing dropped. "Owned only" survives being read as a
 * chip, which is how it will mostly be read.
 *
 * Styled to match SortFilter and HiatusFilter — same pill, border, and
 * translucent ground — so the three read as one cluster of grid controls.
 *
 * The pressed state stays as quiet as the hiatus toggle's, and for the same
 * reason: the loud cyan→blue gradient belongs to the status and source chips,
 * which answer "which slice of the shelf am I looking at". Giving a secondary
 * control the primary treatment made the two compete for the eye. The filled
 * icon and the border carry the state instead.
 */
export function OwnedFilter() {
  const { ownedOnly, setOwnedOnly, pending } = useLibraryFilters();

  return (
    <Button
      onClick={() => setOwnedOnly(!ownedOnly)}
      aria-pressed={ownedOnly}
      variant={ownedOnly ? "secondary" : "outline"}
      className="rounded-full"
      disabled={pending}
    >
      <BookmarkCheck aria-hidden data-icon="inline-start" />
      {/* The label follows the sort trigger's responsive pattern: the icon
          carries it on a phone, where the row is tightest. */}
      <span className="max-sm:sr-only">Owned only</span>
    </Button>
  );
}
