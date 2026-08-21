"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import {
  EntryCardMenu,
  type SourceDialogRequest,
} from "@/components/entry-card-menu";
import { EntrySourceDialog } from "@/components/entry-source-dialog";
import { NoSourceBadge, SourceBadge } from "@/components/source-badge";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { LibraryRow } from "@/lib/data/entries";
import type { RankedSource } from "@/lib/data/rank-sources";
import type { Source } from "@/lib/data/rank-sources";

const STATUS_LABELS: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
  plan_to_read: "Plan to read",
};

/** "42 / 179" — an em dash stands in for an unknown total (ongoing series). */
function progressLabel(read: number, total: number | null): string {
  return `${read} / ${total && total > 0 ? total : "—"}`;
}

export function EntryCard({
  entry,
  topSources = [],
  catalog = [],
}: {
  entry: LibraryRow;
  topSources?: RankedSource[];
  catalog?: Source[];
}) {
  // The dialog lives outside <ContextMenu> — Radix unmounts menu content on
  // close and would take the dialog with it.
  const [dialog, setDialog] = useState<SourceDialogRequest | null>(null);

  const title = entry.media_titles;
  const sources = entry.entry_sources;

  // Primary source first, so the most relevant pill is never the one truncated.
  const ordered = [...sources].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  const visible = ordered.slice(0, 2);
  const overflow = ordered.length - visible.length;

  const total = title.num_chapters;
  const pct =
    total && total > 0
      ? Math.min(100, Math.round((entry.num_chapters_read / total) * 100))
      : 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          href={`/entry/${entry.id}`}
          className="group block focus-visible:outline-none"
        >
          {/* 1:2 portrait, matching Tapas. MAL covers are ~2:3, so object-cover
          crops rather than distorts. */}
          <div className="relative aspect-[1/2] overflow-hidden rounded-md bg-muted ring-offset-background group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
            {title.main_picture_url ? (
              <Image
                src={title.main_picture_url}
                alt=""
                fill
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 130px"
                className="object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-2">
                <span className="text-center font-display text-xs font-semibold text-muted-foreground">
                  {title.title}
                </span>
              </div>
            )}

            {/* Bottom-up scrim so white text stays legible over any artwork. */}
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

            <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 p-1.5">
              {sources.length === 0 ? <NoSourceBadge overlay /> : null}
            </div>

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2">
              <h3 className="line-clamp-3 text-center font-display text-sm font-bold leading-tight text-white drop-shadow">
                {title.title}
              </h3>

              <div className="flex flex-wrap items-center justify-center gap-1">
                {visible.map((es) =>
                  es.sources ? (
                    <SourceBadge
                      key={es.id}
                      overlay
                      source={{
                        name: es.sources.name,
                        isPrimary: es.is_primary,
                        isPaid: es.is_paid,
                        isOfficial: es.is_official,
                      }}
                    />
                  ) : null,
                )}
                {overflow > 0 ? (
                  <span className="rounded-badge bg-white/20 px-1 text-[10px] font-bold text-white backdrop-blur-sm">
                    +{overflow}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-1.5 space-y-1">
            <p className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {STATUS_LABELS[entry.list_status] ?? entry.list_status}
              </span>
              <span className="tabular-nums">
                {progressLabel(entry.num_chapters_read, total)}
              </span>
            </p>

            {/* Only meaningful when the total is known; ongoing series have none. */}
            {total && total > 0 ? (
              <div
                className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${pct}% read`}
              >
                <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </div>
        </Link>
      </ContextMenuTrigger>

      <EntryCardMenu
        entry={entry}
        topSources={topSources}
        onOpenDialog={setDialog}
      />

      <EntrySourceDialog
        entryId={entry.id}
        entryTitle={title.title}
        request={dialog}
        attached={entry.entry_sources}
        catalog={catalog}
        onClose={() => setDialog(null)}
      />
    </ContextMenu>
  );
}
