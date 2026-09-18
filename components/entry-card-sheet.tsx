"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useEntryCardActions,
  type SourceDialogRequest,
} from "@/components/entry-card-menu";
import type { LibraryRow } from "@/lib/data/entries";
import type { RankedSource } from "@/lib/data/rank-sources";

/**
 * The quick actions as a sheet that rises from the bottom — the touch surface.
 *
 * A modal rather than a popup, because a menu anchored to wherever a finger
 * landed is the wrong shape on a phone: it opens somewhere unpredictable, it
 * is easy to dismiss by accident, and it competes with the scroll. A sheet
 * arrives in the same place every time, puts its rows under the thumb, and
 * takes a deliberate press to leave.
 *
 * The actions themselves come from `useEntryCardActions`, shared with the
 * context menu, so the two surfaces cannot drift apart.
 *
 * Rows are plain buttons and anchors rather than menu items. This is a dialog,
 * not a menu: there is no roving focus to emulate, and a real anchor is what
 * lets a reading link be long-pressed or opened in a new tab like any other.
 */
export function EntryCardSheet({
  entry,
  entryTitle,
  topSources,
  open,
  onOpenChange,
  onOpenDialog,
}: {
  entry: LibraryRow;
  entryTitle: string;
  topSources: RankedSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDialog: (request: SourceDialogRequest) => void;
}) {
  const actions = useEntryCardActions({
    entry,
    topSources,
    // Opening the source dialog replaces this sheet rather than stacking on
    // it — two modals deep on a phone is a trap with no visible way back.
    onOpenDialog: (request) => {
      onOpenChange(false);
      onOpenDialog(request);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Overrides the centred placement: pinned to the bottom edge, full
        // width, square along the bottom so it reads as attached to the edge
        // rather than floating. The zoom is neutralised in favour of a slide,
        // which is the motion a sheet is expected to arrive with.
        className="top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 gap-0 rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100 data-open:slide-in-from-bottom-full data-closed:slide-out-to-bottom-full"
        showCloseButton={false}
      >
        {/* The title names the card the sheet belongs to — a sheet that
            arrives detached from what it acts on is disorienting. Radix also
            requires a title for the dialog to be labelled. */}
        <DialogTitle className="truncate px-4 pt-4 pb-2 text-sm font-semibold">
          {entryTitle}
        </DialogTitle>

        <div className="flex flex-col pb-2">
          {actions.map((action) =>
            action.kind === "separator" ? (
              <div key={action.key} className="my-1 h-px bg-border" />
            ) : action.kind === "link" ? (
              <a
                key={action.key}
                href={action.href}
                {...(action.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                onClick={() => onOpenChange(false)}
                className="flex min-h-12 items-center gap-3 px-4 text-sm active:bg-accent [&_svg]:size-4 [&_svg]:shrink-0"
              >
                <action.Icon />
                {action.label}
              </a>
            ) : (
              <button
                key={action.key}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  action.run();
                  onOpenChange(false);
                }}
                className="flex min-h-12 items-center gap-3 px-4 text-left text-sm active:bg-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
              >
                <action.Icon />
                {action.label}
              </button>
            ),
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
