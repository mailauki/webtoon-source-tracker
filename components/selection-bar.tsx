"use client";

import { useState, useTransition } from "react";
import { ListChecks, Pencil } from "lucide-react";
import { toast } from "sonner";

import { bulkEdit, type BulkOp } from "@/app/actions/bulk-edit";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABELS, statusLabel } from "@/lib/data/entry-labels";
import type { Source } from "@/lib/data/rank-sources";

type Selected = Set<number> | null;

/** Starts and ends select mode. */
export function SelectToggle({
  selected,
  setSelected,
}: {
  selected: Selected;
  setSelected: (value: Selected) => void;
}) {
  return (
    <Button
      variant={selected ? "secondary" : "outline"}
      className="rounded-full"
      aria-pressed={!!selected}
      onClick={() => setSelected(selected ? null : new Set())}
    >
      <ListChecks data-icon="inline-start" />
      Select
    </Button>
  );
}

function describe(op: BulkOp, sources: Source[]): string {
  switch (op.kind) {
    case "status":
      return `marked ${statusLabel(op.status)}`;
    case "source":
      return `given ${sources.find((s) => s.id === op.sourceId)?.name ?? "the source"}`;
    case "remove": {
      const where = [
        op.fromLibrary && "your library",
        op.fromMal && "MyAnimeList",
        op.fromAniList && "AniList",
      ].filter(Boolean);
      return `removed from ${where.join(" and ")}`;
    }
    case "restore":
      return "put back";
  }
}

/**
 * Select mode's actions, pinned to the bottom of the viewport. Shared by the
 * library and the category pages.
 *
 * `selectable` is the entry ids the page currently shows: a title picked and
 * then filtered away is not something the user can see they are about to
 * change, so only picks still on screen are acted on. On a partial failure
 * the picks narrow to what did not apply, so trying again is one tap.
 */
export function SelectionBar({
  selectable,
  selected,
  setSelected,
  sources,
}: {
  selectable: number[];
  selected: Set<number>;
  setSelected: (value: Selected) => void;
  sources: Source[];
}) {
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);
  const ids = selectable.filter((id) => selected.has(id));
  const all = ids.length === selectable.length;

  function run(op: BulkOp, targets = ids) {
    startTransition(async () => {
      const { applied, failed, skipped } = await bulkEdit(targets, op);
      const what = describe(op, sources);

      if (failed.length === 0) {
        const n = `${applied.length} ${applied.length === 1 ? "title" : "titles"}`;
        toast.success(
          `${n} ${what}.`,
          // Taking titles out of the library only archives them, so that
          // half can be undone in one tap. A remote delete cannot.
          op.kind === "remove" && op.fromLibrary
            ? {
                action: {
                  label: "Undo",
                  onClick: () => run({ kind: "restore" }, applied),
                },
              }
            : undefined,
        );
        // Kept picked, so a second edit can follow on the same set. Removed
        // titles drop out of `selectable` on their own.
        return;
      }
      toast.error(`${applied.length} of ${targets.length} ${what}.`, {
        description: failed[0].error,
      });
      setSelected(new Set([...failed.map((f) => f.entryId), ...skipped]));
    });
  }

  return (
    <div
      role="toolbar"
      aria-label="Selected titles"
      className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-2 shadow-lg backdrop-blur"
    >
      <span className="px-1 text-sm tabular-nums" aria-live="polite">
        {ids.length} selected
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={() => setSelected(new Set(all ? [] : selectable))}
      >
        {all ? "None" : "All"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="rounded-full"
            disabled={pending || ids.length === 0}
          >
            <Pencil data-icon="inline-start" />
            {pending ? "Saving…" : "Edit"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="min-w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Set status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={() =>
                    run({
                      kind: "status",
                      status: value as Extract<BulkOp, { kind: "status" }>["status"],
                    })
                  }
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {sources.length ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Add source</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                {sources.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => run({ kind: "source", sourceId: s.id })}
                  >
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setRemoving(true)}
          >
            Remove…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Outside the menu: Radix unmounts menu content on close and would
          take the dialog with it. */}
      {/* Keyed on `removing` so each opening starts from the safe defaults
          rather than whatever the last batch ticked. */}
      <RemoveDialog
        key={String(removing)}
        count={ids.length}
        open={removing}
        onOpenChange={setRemoving}
        onConfirm={(targets) => run({ kind: "remove", ...targets })}
      />

      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={pending}
        onClick={() => setSelected(null)}
      >
        Done
      </Button>
    </div>
  );
}

/**
 * The per-title remove dialog's three choices, for a batch. Same defaults:
 * only the reversible one starts ticked.
 *
 * Unlike the per-title dialog, both sites are always offered — a batch mixes
 * titles on either, both or neither — and a title is skipped for any site it
 * is not on.
 */
function RemoveDialog({
  count,
  open,
  onOpenChange,
  onConfirm,
}: {
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targets: {
    fromLibrary: boolean;
    fromMal: boolean;
    fromAniList: boolean;
  }) => void;
}) {
  const [targets, setTargets] = useState({
    fromLibrary: true,
    fromMal: false,
    fromAniList: false,
  });
  const none = !Object.values(targets).some(Boolean);
  const noun = `${count} ${count === 1 ? "title" : "titles"}`;

  const options = [
    {
      key: "fromLibrary",
      label: "From my library",
      hint: "Hides them here. Sources are kept and they can be restored.",
    },
    {
      key: "fromMal",
      label: "From MyAnimeList",
      hint: "Deletes them from your MyAnimeList list. Can’t be undone.",
    },
    {
      key: "fromAniList",
      label: "From AniList",
      hint: "Deletes them from your AniList list. Can’t be undone.",
    },
  ] as const;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {noun}?</AlertDialogTitle>
          <AlertDialogDescription>
            Choose where to remove them from. Taking them out of your library
            keeps the sources you saved and can be undone; removing them from a
            site cannot. Titles that aren&rsquo;t on a site are skipped for it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-3">
          {options.map((o) => (
            <label key={o.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={targets[o.key]}
                onChange={(e) =>
                  setTargets({ ...targets, [o.key]: e.target.checked })
                }
                className={`mt-0.5 size-4 ${
                  o.key === "fromLibrary" ? "accent-brand" : "accent-alert"
                }`}
              />
              <span>
                {o.label}
                <span className="block text-xs text-muted-foreground">
                  {o.hint}
                </span>
              </span>
            </label>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={none}
            className="rounded-pill bg-alert font-bold text-white hover:bg-alert/90"
            onClick={() => {
              onOpenChange(false);
              onConfirm(targets);
            }}
          >
            Remove {noun}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
