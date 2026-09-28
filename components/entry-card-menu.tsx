"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  addEntrySource,
  setEntrySourceUrl,
} from "@/app/actions/entry-sources";
import { updateProgress } from "@/app/actions/progress";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { LinkSuggestion } from "@/lib/data/anilist-links";
import type { LibraryRow } from "@/lib/data/entries";
import type { RankedSource } from "@/lib/data/rank-sources";
import { linkableSources } from "@/lib/data/source-links";
import { syncTargets } from "@/lib/data/sync-targets";

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
 * Attaches a source in one press.
 *
 * With AniList's reading link for it when there is one, so the source is
 * ready to open straight away; otherwise with no URL, and the dialog is where
 * the details get filled in.
 */
export function quickAddSource(
  entry: Pick<LibraryRow, "id">,
  sourceId: number,
  url?: string,
) {
  const formData = new FormData();
  formData.set("entry_id", String(entry.id));
  formData.set("source_id", String(sourceId));
  if (url) formData.set("url", url);
  return addEntrySource(null, formData);
}

/** Gives an attached source AniList's link for it. */
function applyAniListLink(
  entry: Pick<LibraryRow, "id">,
  suggestion: LinkSuggestion,
) {
  const formData = new FormData();
  formData.set("entry_id", String(entry.id));
  formData.set("id", String(suggestion.attachedId));
  formData.set("url", suggestion.url);
  return setEntrySourceUrl(null, formData);
}

/** What /api/entries/[id]/anilist-links answers with. */
export type AniListCardLinks = {
  /** Sources AniList has a reading link for that the entry does not have. */
  add: { sourceId: number; name: string; url: string }[];
  /** Attached sources with no URL that AniList has one for. */
  fill: LinkSuggestion[];
};

/**
 * One lookup per entry for the life of the page.
 *
 * Shared by the context menu and the sheet, and kept across openings: the
 * menu's content unmounts every time it closes, and AniList's links do not
 * change between two right-clicks. What has since been attached is filtered
 * out at render (see useEntryCardActions), so a cached answer never offers a
 * source twice. A failed lookup is dropped from the cache so the next opening
 * can try again.
 */
const anilistLinkCache = new Map<number, Promise<AniListCardLinks | null>>();

function fetchAniListLinks(entryId: number): Promise<AniListCardLinks | null> {
  let pending = anilistLinkCache.get(entryId);
  if (!pending) {
    pending = fetch(`/api/entries/${entryId}/anilist-links`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((body: AniListCardLinks | null) => {
        if (!body) anilistLinkCache.delete(entryId);
        return body;
      });
    anilistLinkCache.set(entryId, pending);
  }
  return pending;
}

/**
 * AniList's links for one entry, fetched the first time `enabled` is true.
 *
 * Undefined while the lookup is in flight, null when it failed or AniList
 * had nothing, so the list can say "checking" rather than flash its fallback
 * shortcuts and then swap them out.
 */
export function useAniListCardLinks(
  entryId: number,
  enabled: boolean,
): AniListCardLinks | null | undefined {
  const [links, setLinks] = useState<AniListCardLinks | null | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    fetchAniListLinks(entryId).then((result) => {
      if (current) setLinks(result);
    });
    return () => {
      current = false;
    };
  }, [entryId, enabled]);

  return links;
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
  open,
}: {
  entry: LibraryRow;
  topSources: RankedSource[];
  onOpenDialog: (request: SourceDialogRequest) => void;
  /**
   * Whether the surface is showing. AniList is only asked once it is: the
   * sheet stays mounted while closed, and a shelf of cards asking up front
   * would be one AniList request per title.
   */
  open: boolean;
}): CardAction[] {
  const [isPending, startTransition] = useTransition();
  const total = entry.media_titles.num_chapters;

  // An unknown total (ongoing series) never caps progress.
  const atEnd = Boolean(total && total > 0 && entry.num_chapters_read >= total);

  // The same rule the entry page's editor applies, from the same module: both
  // surfaces submit updateProgress, so both have to agree about where an edit
  // goes. Only `nowhereToSave` matters here — the case the action refuses
  // outright, where offering the item would mean one that can only fail. The
  // service names are left to the entry page, which has room for the sentence;
  // a menu row has to stay short enough to scan.
  const { nowhereToSave } = syncTargets(entry);

  const attached = entry.entry_sources;
  const linkable = linkableSources(attached);
  const addable = addableSources(attached, topSources);
  const status = nextStatus(entry.list_status);

  // AniList's links, filtered against what the entry has now rather than when
  // they were fetched: a source added a moment ago must not be offered again.
  const anilist = useAniListCardLinks(entry.id, open);
  const attachedIds = new Set(attached.map((es) => es.sources?.id));
  const missingUrl = new Set(attached.filter((es) => !es.url).map((es) => es.id));
  const anilistAdds = (anilist?.add ?? []).filter(
    (link) => !attachedIds.has(link.sourceId),
  );
  const anilistFills = (anilist?.fill ?? []).filter((suggestion) =>
    missingUrl.has(suggestion.attachedId),
  );

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
      // The disabled reason belongs in the label: both surfaces render it, and
      // a greyed-out row with no explanation is a dead end on a phone, where
      // there is no title attribute to reveal on hover.
      label: nowhereToSave
        ? "Can't record progress — AniList syncing is off"
        : "Add 1 chapter",
      disabled: atEnd || isPending || nowhereToSave,
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
      disabled: isPending || nowhereToSave,
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

  // AniList's links first: the same quick adds the entry page offers, and
  // unlike the plain shortcuts below they arrive with a URL, so the source is
  // ready to open. Shown whatever is already attached, like the entry page.
  actions.push(
    ...anilistFills.map(
      (suggestion): CardAction => ({
        kind: "run",
        key: `fill-${suggestion.attachedId}`,
        Icon: Link2,
        label: `Use AniList link for ${suggestion.sourceName}`,
        disabled: isPending,
        run: () => run(() => applyAniListLink(entry, suggestion)),
      }),
    ),
    ...anilistAdds.map(
      (link): CardAction => ({
        kind: "run",
        key: `anilist-add-${link.sourceId}`,
        Icon: Plus,
        label: `Add ${link.name} from AniList`,
        disabled: isPending,
        run: () => run(() => quickAddSource(entry, link.sourceId, link.url)),
      }),
    ),
  );

  if (anilist === undefined && open) {
    // A row rather than nothing, so the list does not grow under the pointer
    // without warning when the answer lands.
    actions.push({
      kind: "run",
      key: "anilist-loading",
      Icon: Loader2,
      label: "Checking AniList for links…",
      disabled: true,
      run: () => {},
    });
  }

  // With nothing attached and nothing from AniList, the usual shortcuts are
  // the whole point of the list; once something is attached, editing it
  // matters more than attaching another.
  if (attached.length === 0 && anilist !== undefined && anilistAdds.length === 0) {
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
  open,
}: {
  entry: LibraryRow;
  topSources: RankedSource[];
  onOpenDialog: (request: SourceDialogRequest) => void;
  /**
   * Whether the menu is showing. This component stays mounted while the menu
   * is closed — Radix unmounts only the content below — so AniList is asked
   * only once this turns true.
   */
  open: boolean;
}) {
  const actions = useEntryCardActions({
    entry,
    topSources,
    onOpenDialog,
    open,
  });

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
