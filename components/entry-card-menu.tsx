"use client";

import { useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { addEntrySource } from "@/app/actions/entry-sources";
import { updateProgress } from "@/app/actions/progress";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { LibraryRow } from "@/lib/data/entries";
import type { RankedSource } from "@/lib/data/rank-sources";

/**
 * Sends a partial progress update for one entry.
 *
 * Exported so the status path stays testable: Radix drives submenu selection
 * off pointer geometry jsdom does not compute, so a sub-item's `onSelect`
 * cannot be exercised through the rendered menu.
 */
export function submitPatch(
  entry: Pick<LibraryRow, "id">,
  patch: Record<string, string>,
) {
  const formData = new FormData();
  formData.set("entry_id", String(entry.id));
  for (const [key, value] of Object.entries(patch)) formData.set(key, value);
  return updateProgress(null, formData);
}

/** The status a radio item submits when chosen. */
export function submitStatus(entry: Pick<LibraryRow, "id">, status: string) {
  return submitPatch(entry, { list_status: status });
}

/**
 * Attaches a source with nothing but the link between them.
 *
 * The URL is left empty on purpose: this is the one-click path, and the dialog
 * is where the details get filled in.
 */
export function quickAddSource(
  entry: Pick<LibraryRow, "id">,
  sourceId: number,
) {
  const formData = new FormData();
  formData.set("entry_id", String(entry.id));
  formData.set("source_id", String(sourceId));
  return addEntrySource(null, formData);
}

const STATUS_OPTIONS = [
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_read", label: "Plan to read" },
];

/**
 * The quick-add shortcuts worth showing for one entry.
 *
 * A source already attached is not offered again — the unique index on
 * (entry_id, source_id) would reject it, so the item could only ever produce
 * an error toast.
 */
export function addableSources(
  attached: { sources: { id: number } | null }[],
  topSources: RankedSource[],
): RankedSource[] {
  const attachedIds = new Set(attached.map((es) => es.sources?.id));
  return topSources.filter((s) => !attachedIds.has(s.id));
}

export type SourceDialogRequest =
  { mode: "add" } | { mode: "edit"; entrySourceId: number };

type ActionResult = { ok?: boolean; error?: string; message?: string } | null;

/**
 * Quick actions for a library card, opened by right-click or long-press.
 *
 * Writes go through the same actions the entry page uses, so MAL and the
 * source table stay the single source of truth. Failures surface as a toast —
 * the menu has closed by the time one arrives, so there is nowhere left in it
 * to show them.
 */
export function EntryCardMenu({
  entry,
  topSources,
  onOpenDialog,
}: {
  entry: LibraryRow;
  topSources: RankedSource[];
  onOpenDialog: (request: SourceDialogRequest) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const total = entry.media_titles.num_chapters;

  // An unknown total (ongoing series) never caps progress.
  const atEnd = Boolean(total && total > 0 && entry.num_chapters_read >= total);

  const attached = entry.entry_sources;
  const addable = addableSources(attached, topSources);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <ContextMenuContent className="w-56">
      <ContextMenuItem
        disabled={atEnd || isPending}
        onSelect={() =>
          run(() =>
            submitPatch(entry, {
              num_chapters_read: String(entry.num_chapters_read + 1),
            }),
          )
        }
      >
        <Plus />
        Add 1 chapter
      </ContextMenuItem>

      <ContextMenuSub>
        <ContextMenuSubTrigger>Status</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup value={entry.list_status}>
            {STATUS_OPTIONS.map((option) => (
              <ContextMenuRadioItem
                key={option.value}
                value={option.value}
                disabled={isPending}
                onSelect={() => run(() => submitStatus(entry, option.value))}
              >
                {option.label}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>Sources</ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">
          {attached.length > 0 ? (
            <>
              <ContextMenuLabel>Attached</ContextMenuLabel>
              {attached.map((es) => (
                <ContextMenuItem
                  key={es.id}
                  onSelect={() =>
                    onOpenDialog({ mode: "edit", entrySourceId: es.id })
                  }
                >
                  <Pencil />
                  {es.sources?.name ?? "Unknown source"}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
            </>
          ) : null}

          {addable.length > 0 ? (
            <>
              <ContextMenuLabel>Add</ContextMenuLabel>
              {addable.map((source) => (
                <ContextMenuItem
                  key={source.id}
                  disabled={isPending}
                  onSelect={() => run(() => quickAddSource(entry, source.id))}
                >
                  <Plus />
                  {source.name}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
            </>
          ) : null}

          <ContextMenuItem onSelect={() => onOpenDialog({ mode: "add" })}>
            <Plus />
            Add source…
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  );
}
