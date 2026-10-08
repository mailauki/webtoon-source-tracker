import { ExternalLink } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { MergeDuplicateButton } from "@/components/merge-duplicate-button";
import { Button } from "@/components/ui/button";
import { kindsCompatible, nameKeys } from "@/lib/data/cross-search";
import { displayTitle } from "@/lib/data/display-title";
import { findDuplicates, type DuplicateRow } from "@/lib/data/duplicates";
import { malAltTitles } from "@/lib/mal/alt-titles";
import { searchManga } from "@/lib/mal/endpoints";
import { searchOtherSiteUrl } from "@/lib/sync/unmatched-titles";
import { createClient } from "@/lib/supabase/server";

type Title = DuplicateRow["media_titles"] & { anilist_media_id: number };

/**
 * The MyAnimeList title an AniList-only title looks like, by the same strict
 * name rule as findDuplicates, from a live MAL search. Null when MAL has no
 * single match or cannot be reached.
 */
async function findOnMal(title: Title) {
  try {
    const page = await searchManga(null, title.title.slice(0, 64), 10, {
      includeMature: true,
    });
    const keys = nameKeys({ ...title, alt_titles: title.alt_titles ?? [] });
    const matches = page.data
      .map(({ node }) => node)
      .filter(
        (node) =>
          kindsCompatible(node.media_type ?? null, title.mal_media_kind) &&
          [
            ...nameKeys({
              title: node.title,
              title_en: node.alternative_titles?.en || null,
              alt_titles: malAltTitles(node),
            }),
          ].some((key) => keys.has(key)),
      );
    return matches.length === 1 ? matches[0] : null;
  } catch (cause) {
    console.error("[entry-mal-link] MAL search failed:", cause);
    return null;
  }
}

/**
 * For a title only AniList has: how to link it to MyAnimeList.
 *
 * AniList entries carry their MyAnimeList id by hand, and until someone adds
 * it this title cannot sync to MyAnimeList or merge with its MyAnimeList
 * twin. This sends the reader to AniList's edit page with the id ready to
 * paste. When the same series is also in their library, it offers the merge
 * here too.
 */
export async function EntryMalLink({
  entryId,
  title,
}: {
  entryId: number;
  title: Title;
}) {
  const found = await findOnMal(title);

  // The library copy, if any, and only when it passes the same check the
  // merge action makes — so the button is never offered to be refused.
  let twin: { id: number; title: string } | null = null;
  if (found) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_entries")
      .select(
        "id, media_titles!inner (mal_media_id, anilist_media_id, title, title_en, alt_titles, mal_media_kind)",
      )
      .is("archived_at", null)
      .eq("media_titles.mal_media_id", found.id);
    const [pair] = findDuplicates([{ id: entryId, media_titles: title }, ...(data ?? [])]);
    if (pair?.anilist.id === entryId) {
      twin = { id: pair.mal.id, title: displayTitle(pair.mal.media_titles) };
    }
  }

  const malUrl = found ? `https://myanimelist.net/manga/${found.id}` : null;

  return (
    <section className="grid gap-3 rounded-xl border border-border p-3">
      <div>
        <h2 className="text-sm font-semibold">Not linked to MyAnimeList</h2>
        <p className="text-sm text-muted-foreground">
          AniList hasn&rsquo;t recorded a MyAnimeList id for this title, so it
          can&rsquo;t sync to MyAnimeList. Adding the id on AniList links the
          two for everyone.
        </p>
      </div>

      {found && malUrl ? (
        <div className="grid gap-2">
          <p className="text-sm">
            Looks like{" "}
            <a
              href={malUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
              {found.title}
              <ExternalLink aria-hidden className="size-3" />
            </a>{" "}
            <span className="text-muted-foreground tabular-nums">#{found.id}</span>{" "}
            on MyAnimeList.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={String(found.id)} label="MAL id" />
            <CopyButton value={malUrl} label="MAL link" />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline" className="rounded-pill">
          <a
            href={`https://anilist.co/edit/manga/${title.anilist_media_id}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink data-icon="inline-start" />
            Edit on AniList
          </a>
        </Button>
        {found ? null : (
          <Button asChild size="sm" variant="ghost" className="rounded-pill">
            <a
              href={searchOtherSiteUrl({
                onlyOn: "anilist",
                id: title.anilist_media_id,
                title: title.title,
              })}
              target="_blank"
              rel="noreferrer noopener"
            >
              Search MyAnimeList
            </a>
          </Button>
        )}
      </div>

      {twin ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
          <p className="text-muted-foreground">
            “{twin.title}” is also in your library, from MyAnimeList.
          </p>
          <MergeDuplicateButton
            anilistEntryId={entryId}
            malEntryId={twin.id}
            anilistTitle={title.title}
            malTitle={twin.title}
            openAfter
          />
        </div>
      ) : null}
    </section>
  );
}
