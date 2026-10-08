import Link from "next/link";

import { DismissDuplicateButton } from "@/components/dismiss-duplicate-button";
import { MergeDuplicateButton } from "@/components/merge-duplicate-button";
import { displayTitle } from "@/lib/data/display-title";
import type { DuplicatePair } from "@/lib/data/duplicates";
import type { LibraryRow } from "@/lib/data/entries";

/**
 * Library titles that look like one series held twice — see findDuplicates —
 * each with the two entries and a Merge button.
 */
export function DuplicateTitles({ pairs }: { pairs: DuplicatePair<LibraryRow>[] }) {
  if (pairs.length === 0) {
    return <p className="text-sm text-muted-foreground">No possible duplicates found.</p>;
  }

  return (
    <ul className="grid gap-2">
      {pairs.map(({ anilist, mal }) => (
        <li
          key={anilist.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <div className="grid min-w-0 gap-0.5">
            <Link href={`/entry/${mal.id}`} className="break-words underline-offset-4 hover:underline">
              {displayTitle(mal.media_titles)}{" "}
              <span className="text-xs text-muted-foreground">MyAnimeList</span>
            </Link>
            <Link href={`/entry/${anilist.id}`} className="break-words underline-offset-4 hover:underline">
              {displayTitle(anilist.media_titles)}{" "}
              <span className="text-xs text-muted-foreground">AniList</span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <DismissDuplicateButton
              anilistTitleId={anilist.media_titles.id}
              malTitleId={mal.media_titles.id}
            />
            <MergeDuplicateButton
              anilistEntryId={anilist.id}
              malEntryId={mal.id}
              anilistTitle={displayTitle(anilist.media_titles)}
              malTitle={displayTitle(mal.media_titles)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
