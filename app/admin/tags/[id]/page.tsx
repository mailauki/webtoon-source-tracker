import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TagForm } from "@/components/admin/tag-form";
import { TagTitlePicker } from "@/components/admin/tag-title-picker";
import { TaggedTitleList } from "@/components/admin/tagged-title-list";
import { Badge } from "@/components/ui/badge";
import {
  getTagForAdmin,
  getTaggedTitlesForAdmin,
  searchCatalogTitles,
} from "@/lib/data/admin";

export async function generateMetadata({ params }: PageProps<"/admin/tags/[id]">) {
  const { id } = await params;
  const tag = await getTagForAdmin(Number(id));
  return { title: tag ? `${tag.name} · Admin` : "Not found" };
}

/**
 * One tag: its own fields, and the titles carrying it.
 *
 * The search term lives in `?q=` so the catalog query runs on the server —
 * see searchCatalogTitles for why this one cannot filter rows already sent
 * the way the library picker does. Reading searchParams makes this page
 * dynamic, which it already is: every read here goes through RLS on a
 * per-request client.
 *
 * No verifyAdmin() call — app/admin/layout.tsx ran it, and the DAL's cache()
 * makes a second call a memo hit rather than a second real check.
 */
export default async function AdminTagPage({
  params,
  searchParams,
}: PageProps<"/admin/tags/[id]">) {
  const { id } = await params;
  const tagId = Number(id);
  if (!Number.isInteger(tagId) || tagId <= 0) notFound();

  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";

  const [tag, titles, results] = await Promise.all([
    getTagForAdmin(tagId),
    getTaggedTitlesForAdmin(tagId),
    searchCatalogTitles(query),
  ]);

  // A retired tag is deliberately NOT a 404 here, unlike /discover/tag/[slug]:
  // this is the page that retires it, so it has to survive its own effect.
  if (!tag) notFound();

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/tags"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Tags
      </Link>

      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {tag.name}
          </h1>
          <Badge variant="outline">{tag.kind}</Badge>
          {tag.mal_genre_id !== null ? (
            <Badge variant="outline">MAL</Badge>
          ) : null}
          {tag.is_active ? null : <Badge variant="outline">Retired</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {titles.length} {titles.length === 1 ? "title" : "titles"} carry this
          tag.
        </p>
      </div>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="font-display text-base font-bold">Details</h2>
        <TagForm tag={tag} />
      </section>

      <TagTitlePicker
        tagId={tag.id}
        results={results}
        query={query}
        taggedTitleIds={titles.map((title) => title.id)}
      />

      <section className="grid gap-3">
        <h2 className="font-display text-base font-bold">Tagged titles</h2>
        <TaggedTitleList tagId={tag.id} titles={titles} />
      </section>
    </div>
  );
}
