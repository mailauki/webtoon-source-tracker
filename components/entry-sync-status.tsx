import { ExternalLink } from "lucide-react";

/**
 * Where this title lives, and whether its progress still travels there.
 *
 * Both halves matter and neither implies the other. A title can be on a site
 * the app no longer writes to (excluded, or removed there while kept here),
 * and it can be missing from a site entirely now that the catalog holds
 * AniList-only rows. The old page showed only the links, which answered the
 * first question and left the second invisible — so a user who had turned
 * syncing off, or removed a title from one list, had nowhere to confirm it.
 *
 * Rendered as one row per site rather than a pair of badges, because the
 * useful comparison is between the two services: "MyAnimeList yes, AniList no"
 * is the fact being looked for.
 */

type SiteState = {
  name: string;
  /** Null when this site has no entry for the title at all. */
  url: string | null;
  /** Whether progress is written here. Meaningless when `url` is null. */
  syncing: boolean;
};

function siteLabel(site: SiteState): string {
  if (site.url === null) return "Not on this site";
  return site.syncing ? "Syncing" : "Not syncing";
}

export function EntrySyncStatus({
  malMediaId,
  anilistMediaId,
  syncToMal,
  syncToAniList,
  archived,
}: {
  malMediaId: number | null;
  anilistMediaId: number | null;
  syncToMal: boolean;
  syncToAniList: boolean;
  archived: boolean;
}) {
  const sites: SiteState[] = [
    {
      name: "MyAnimeList",
      url:
        malMediaId === null
          ? null
          : `https://myanimelist.net/manga/${malMediaId}`,
      syncing: syncToMal,
    },
    {
      name: "AniList",
      url:
        anilistMediaId === null
          ? null
          : `https://anilist.co/manga/${anilistMediaId}`,
      syncing: syncToAniList,
    },
  ];

  return (
    <div className="grid gap-2 rounded-xl border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Tracked on</h2>
        {/* An archived title syncs nowhere regardless of its flags, so saying
            "not syncing" twice below without this would read as two settings
            the user does not remember changing. */}
        <p className="text-xs text-muted-foreground">
          {archived ? "Removed from your library" : "In your library"}
        </p>
      </div>

      <ul className="grid gap-1.5">
        {sites.map((site) => {
          const missing = site.url === null;
          // Archived overrides the per-site flag: nothing is written anywhere
          // while a title is off the shelf.
          const active = !missing && site.syncing && !archived;

          return (
            <li
              key={site.name}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${
                    active
                      ? "bg-brand"
                      : missing
                        ? "bg-muted-foreground/30"
                        : "bg-alert"
                  }`}
                />
                {site.url ? (
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  >
                    {site.name}
                    <ExternalLink aria-hidden className="size-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{site.name}</span>
                )}
              </span>

              <span
                className={`text-xs ${
                  active ? "text-muted-foreground" : "text-alert"
                }`}
              >
                {archived && !missing ? "Paused" : siteLabel(site)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
