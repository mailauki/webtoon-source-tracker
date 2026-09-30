import type { AuthorMismatch, MergedAuthor } from "@/lib/data/author-works";

/**
 * The header's "by" line: who made the title, as MyAnimeList and AniList
 * credit them together (see mergeAuthors).
 *
 * Each name links to that person's page on MyAnimeList where it has one, else
 * on AniList — where the rest of their work is listed. Where the two sites
 * spell the name differently, the other spelling is on hover: it is the same
 * person, so it is not a disagreement worth the alert below, but it is how
 * AniList will list them. Renders nothing when neither site credits anyone,
 * rather than an empty "By".
 */
export function EntryAuthors({ authors }: { authors: MergedAuthor[] }) {
  if (authors.length === 0) return null;

  return (
    <p className="text-sm text-muted-foreground">
      By{" "}
      {authors.map((author, i) => {
        const url = author.mal?.url ?? author.anilist?.url ?? null;
        const alsoSpelled =
          author.matchedOn === "spelling" && author.anilist
            ? `Spelled ${author.anilist.name} on AniList`
            : undefined;
        return (
          <span key={author.key}>
            {i > 0 ? ", " : null}
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={alsoSpelled}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {author.name}
              </a>
            ) : (
              <span title={alsoSpelled} className="font-medium text-foreground">
                {author.name}
              </span>
            )}
            {author.roles.length > 0 ? ` (${author.roles.join(", ")})` : null}
          </span>
        );
      })}
    </p>
  );
}

const SITE_NAMES = { mal: "MyAnimeList", anilist: "AniList" } as const;

/**
 * Where MyAnimeList's credits and AniList's disagree. The counterpart to the
 * page's chapter-count check, in the same quiet alert, and silent when they
 * agree — which is most titles.
 */
export function AuthorCheck({ mismatches }: { mismatches: AuthorMismatch[] }) {
  if (mismatches.length === 0) return null;

  return (
    <div role="status" className="grid gap-1 rounded-xl border border-alert/40 p-3">
      <h2 className="text-sm font-semibold">Authors differ</h2>
      <ul className="grid gap-0.5 text-sm text-muted-foreground">
        {mismatches.map((mismatch) => (
          <li key={`${mismatch.kind}:${mismatch.name}`}>
            {mismatch.kind === "missing"
              ? `${mismatch.name} is credited on ${SITE_NAMES[mismatch.creditedBy]} only.`
              : `${mismatch.name}: ${mismatch.mal} on MyAnimeList, ${mismatch.anilist} on AniList.`}
          </li>
        ))}
      </ul>
    </div>
  );
}
