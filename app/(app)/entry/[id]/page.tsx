import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { EntrySourceEditor } from "@/components/entry-source-editor";
import { ProgressEditor } from "@/components/progress-editor";
import { Badge } from "@/components/ui/badge";
import { verifySession } from "@/lib/auth/dal";
import { getEntry } from "@/lib/data/entries";
import { getSources } from "@/lib/data/sources";

const STATUS_LABELS: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
  plan_to_read: "Plan to read",
};

export async function generateMetadata({ params }: PageProps<"/entry/[id]">) {
  const { id } = await params;
  const entry = await getEntry(Number(id));
  return {
    title: entry ? entry.media_titles.title : "Not found",
  };
}

export default async function EntryPage({ params }: PageProps<"/entry/[id]">) {
  await verifySession();

  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId <= 0) notFound();

  const [entry, catalog] = await Promise.all([getEntry(entryId), getSources()]);

  // RLS makes "does not exist" and "belongs to someone else" indistinguishable
  // here, which is what we want: both 404 rather than confirming existence.
  if (!entry) notFound();

  const title = entry.media_titles;
  const total = title.num_chapters;
  const pct =
    total && total > 0
      ? Math.min(100, Math.round((entry.num_chapters_read / total) * 100))
      : null;

  return (
    <div className="grid gap-8">
      <Link
        href="/library"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to library
      </Link>

      <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
        <div className="relative aspect-[1/2] w-full max-w-[160px] overflow-hidden rounded-md bg-muted">
          {title.main_picture_url ? (
            <Image
              src={title.main_picture_url}
              alt=""
              fill
              sizes="160px"
              className="object-cover"
              priority
            />
          ) : null}
        </div>

        <div className="grid content-start gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{title.title}</h1>
            {title.title_en && title.title_en !== title.title ? (
              <p className="text-sm text-muted-foreground">{title.title_en}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-pill">
              {STATUS_LABELS[entry.list_status] ?? entry.list_status}
            </Badge>
            {title.mal_media_kind ? (
              <Badge variant="outline" className="rounded-pill capitalize">
                {title.mal_media_kind.replace("_", " ")}
              </Badge>
            ) : null}
            {entry.score > 0 ? (
              <Badge variant="outline" className="rounded-pill">
                Scored {entry.score}/10
              </Badge>
            ) : null}
            {entry.is_rereading ? (
              <Badge variant="outline" className="rounded-pill">
                Rereading
              </Badge>
            ) : null}
          </div>

          <div className="grid gap-1">
            <p className="text-sm">
              <span className="font-medium tabular-nums">
                {entry.num_chapters_read}
              </span>
              <span className="text-muted-foreground">
                {" / "}
                {total && total > 0 ? total : "—"} chapters
              </span>
            </p>
            {pct !== null ? (
              <div
                className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted"
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

          <a
            href={`https://myanimelist.net/manga/${title.mal_media_id}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View on MyAnimeList
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <ProgressEditor entry={entry} />

      <EntrySourceEditor
        entryId={entry.id}
        sources={entry.entry_sources}
        catalog={catalog}
      />
    </div>
  );
}
