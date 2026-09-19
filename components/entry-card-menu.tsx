"use client";

import { useTransition } from "react";
import {
  BookOpen,
  Check,
  ExternalLink,
  Pencil,
  Plus,
  type LucideIcon,
} from "lucide-react";
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
 * One row of the quick-actions list.
 *
 * The list is described rather than rendered so that the two surfaces that
 * show it — a context menu on a mouse, a sheet on a phone — cannot drift
 * apart. Adding an action means adding it here once.
 */
export type CardAction =
  | { kind: "separator"; key: string }
  | {
      kind: "run";
      key: string;
      Icon: LucideIcon;
      label: string;
      disabled: boolean;
      run: () => void;
    }
  | {
      kind: "link";
      key: string;
      Icon: LucideIcon;
      label: string;
      href: string;
      /** Leaves the app, so it gets a new tab and the rel that goes with it. */
      external?: boolean;
    };

/**
 * The quick actions for one library card.
 *
 * Deliberately flat. Radix drives submenu selection off pointer geometry that
 * jsdom does not compute, so anything nested was unreachable in tests and
 * fiddly on touch; every action here is one press deep.
 *
 * Writes go through the same server actions the entry page uses, so MyAnimeList
 * and the source table stay the single source of truth. Failures surface as a
 * toast — whichever surface opened has closed by the time one arrives, so there
 * is nowhere left in it to show them.
 */
export function useEntryCardActions({
  entry,
  topSources,
  onOpenDialog,
}: {
  entry: LibraryRow;
  topSources: RankedSource[];
  onOpenDialog: (request: SourceDialogRequest) => void;
}): CardAction[] {
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

  const actions: CardAction[] = [
    {
      kind: "run",
      key: "add-chapter",
      Icon: Plus,
      label: "Add 1 chapter",
      disabled: atEnd || isPending,
      run: () =>
        run(() =>
          submitPatch(entry, {
            num_chapters_read: String(entry.num_chapters_read + 1),
          }),
        ),
    },
  ];

  if (status) {
    actions.push({
      kind: "run",
      key: "status",
      Icon: Check,
      label: status.label,
      disabled: isPending,
      run: () => run(() => submitStatus(entry, status.value)),
    });
  }

  actions.push(
    { kind: "separator", key: "sep-go" },
    {
      kind: "link",
      key: "entry",
      Icon: BookOpen,
      label: "Go to entry",
      href: `/entry/${entry.id}`,
    },
    ...linkable.map(
      (es): CardAction => ({
        kind: "link",
        key: `source-${es.id}`,
        Icon: ExternalLink,
        label: `Go to ${es.sources!.name}`,
        href: es.url!,
        external: true,
      }),
    ),
    { kind: "separator", key: "sep-sources" },
  );

  // With nothing attached, the shortcuts are the whole point of the list; once
  // something is, editing it matters more than attaching another.
  if (attached.length === 0) {
    actions.push(
      ...addable.map(
        (source): CardAction => ({
          kind: "run",
          key: `add-${source.id}`,
          Icon: Plus,
          label: `Add ${source.name}`,
          disabled: isPending,
          run: () => run(() => quickAddSource(entry, source.id)),
        }),
      ),
    );
  } else {
    actions.push(
      ...attached.map(
        (es): CardAction => ({
          kind: "run",
          key: `edit-${es.id}`,
          Icon: Pencil,
          label: `Edit ${es.sources?.name ?? "source"}`,
          disabled: false,
          run: () => onOpenDialog({ mode: "edit", entrySourceId: es.id }),
        }),
      ),
    );
  }

  actions.push({
    kind: "run",
    key: "add-source",
    Icon: Plus,
    label: "Add source…",
    disabled: false,
    run: () => onOpenDialog({ mode: "add" }),
  });

  // TODO(remove-entry): there is no "remove from my library" here, so a title
  // can only ever be added. Note it is NOT the "Dropped" status the progress
  // editor offers, which keeps the row and everything hanging off it — the two
  // read alike as menu items and differ by a cascade through entry_sources
  // that no re-sync can rebuild. See TODO.md.
  return actions;
}

/**
 * The quick actions as a context menu — the mouse surface.
 *
 * Right-click is where a secondary action belongs on a desktop: the card's own
 * click is a link to the entry page, and nothing has to be given up to reach
 * the menu. On a phone the same actions open as a sheet instead, from the ⋯
 * button; see EntryCardSheet.
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
  const actions = useEntryCardActions({ entry, topSources, onOpenDialog });

  return (
    <ContextMenuContent className="w-56">
      {actions.map((action) =>
        action.kind === "separator" ? (
          <ContextMenuSeparator key={action.key} />
        ) : action.kind === "link" ? (
          <ContextMenuItem key={action.key} asChild>
            <a
              href={action.href}
              {...(action.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              <action.Icon />
              {action.label}
            </a>
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            key={action.key}
            disabled={action.disabled}
            onSelect={action.run}
          >
            <action.Icon />
            {action.label}
          </ContextMenuItem>
        ),
      )}
    </ContextMenuContent>
  );
}
