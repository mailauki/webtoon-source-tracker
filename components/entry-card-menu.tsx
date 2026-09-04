"use client";

import { useTransition } from "react";
import { BookOpen, Check, ExternalLink, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { addEntrySource } from "@/app/actions/entry-sources";
import { updateProgress } from "@/app/actions/progress";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { LibraryRow } from "@/lib/data/entries";
import type { RankedSource } from "@/lib/data/rank-sources";
import { linkableSources } from "@/lib/data/source-links";

/**
 * Sends a partial progress update for one entry.
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

/** The status change the one-click status item submits. */
function submitStatus(entry: Pick<LibraryRow, "id">, status: string) {
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

/**
 * The single status change worth offering for the status an entry is in.
 *
 * The menu used to carry all five statuses in a radio submenu. Only one move
 * is ever the obvious next one, so the menu offers that and sends the rest to
 * the entry page: reading finishes, a finished title gets re-read, and the
 * parked statuses (on hold, dropped, plan to read) resume.
 */
export function nextStatus(
  current: string,
): { value: string; label: string } | null {
  switch (current) {
    case "reading":
      return { value: "completed", label: "Mark as completed" };
    case "completed":
      return { value: "reading", label: "Mark as reading" };
    case "on_hold":
    case "dropped":
    case "plan_to_read":
      return { value: "reading", label: "Start reading" };
    default:
      return null;
  }
}

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
 * Deliberately flat. Radix drives submenu selection off pointer geometry that
 * jsdom does not compute, so anything nested was unreachable in tests and
 * fiddly under a long-press on touch; every item here is one click deep.
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
  const linkable = linkableSources(attached);
  const addable = addableSources(attached, topSources);
  const status = nextStatus(entry.list_status);

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

      {status ? (
        <ContextMenuItem
          disabled={isPending}
          onSelect={() => run(() => submitStatus(entry, status.value))}
        >
          <Check />
          {status.label}
        </ContextMenuItem>
      ) : null}

      <ContextMenuSeparator />

      <ContextMenuItem asChild>
        <a href={`/entry/${entry.id}`}>
          <BookOpen />
          Go to entry
        </a>
      </ContextMenuItem>

      {/* Reading links open away from the app, so they get the new tab and the
          noreferrer that goes with it. */}
      {linkable.map((es) => (
        <ContextMenuItem key={es.id} asChild>
          <a href={es.url!} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Go to {es.sources!.name}
          </a>
        </ContextMenuItem>
      ))}

      <ContextMenuSeparator />

      {/* With nothing attached, the shortcuts are the whole point of the menu;
          once something is, editing it matters more than attaching another. */}
      {attached.length === 0
        ? addable.map((source) => (
            <ContextMenuItem
              key={source.id}
              disabled={isPending}
              onSelect={() => run(() => quickAddSource(entry, source.id))}
            >
              <Plus />
              Add {source.name}
            </ContextMenuItem>
          ))
        : attached.map((es) => (
            <ContextMenuItem
              key={es.id}
              onSelect={() =>
                onOpenDialog({ mode: "edit", entrySourceId: es.id })
              }
            >
              <Pencil />
              Edit {es.sources?.name ?? "source"}
            </ContextMenuItem>
          ))}

      <ContextMenuItem onSelect={() => onOpenDialog({ mode: "add" })}>
        <Plus />
        Add source…
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
