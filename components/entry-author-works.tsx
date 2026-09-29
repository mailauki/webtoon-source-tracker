import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { CoverImage } from "@/components/cover-image";
import { ProTeaser } from "@/components/pro-teaser";
import type { AuthorCredit, RelatedWork } from "@/lib/data/author-works";

/**
 * "More from this author": the other titles the title's authors made.
 *
 * A title the reader tracks opens its entry page; anything else opens on
 * AniList, in a new tab, and says so — this is not a shelf of the catalog, and
 * it should not look like one. The works themselves come from AniList (see
 * lib/data/author-works.ts), so a title nobody here tracks still shows.
 *
 * Pro. Without it the section is only the teaser, and the page never asks
 * AniList for the staff it would have shown.
 */
export function EntryAuthorWorks(
  props:
    | { isPro: false }
    | { isPro: true; authors: AuthorCredit[]; works: RelatedWork[] },
) {
  if (!props.isPro) {
    return (
      <Section heading="More from the author">
        <ProTeaser feature="authors" />
      </Section>
    );
  }

  const { authors, works } = props;
  // AniList credits no author for this title (or could not be reached): there
  // is nobody to name, and "nothing else by nobody" says nothing.
  if (authors.length === 0) return null;

  const tracked = works.filter((work) => work.entryId !== null).length;

  return (
    <Section
      heading={
        authors.length <= 2
          ? `More from ${authors.map((author) => author.name).join(" & ")}`
          : "More from the authors"
      }
    >
      <p className="text-sm text-muted-foreground">
        <AuthorNames authors={authors} />
        {works.length === 0
          ? " — nothing else on AniList."
          : tracked > 0
            ? ` — ${tracked} in your library.`
            : " — none in your library yet."}
      </p>

      {works.length > 0 ? (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {works.map((work) => (
            <li key={work.anilistId} className="w-[110px] shrink-0 snap-start">
              <WorkCard work={work} />
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    // Anchored like #sources and #collections, so /entry/[id]#authors lands here.
    <section id="authors" className="grid gap-3">
      <h2 className="font-display text-lg font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

/** Each author, linked to their AniList page, with what they did. */
function AuthorNames({ authors }: { authors: AuthorCredit[] }) {
  return authors.map((author, i) => (
    <span key={author.id}>
      {i > 0 ? ", " : null}
      {author.url ? (
        <a
          href={author.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {author.name}
        </a>
      ) : (
        <span className="font-medium text-foreground">{author.name}</span>
      )}{" "}
      ({author.roles.join(", ")})
    </span>
  ));
}

function WorkCard({ work }: { work: RelatedWork }) {
  const body = (
    <>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
        <CoverImage src={work.cover} title={work.title} sizes="110px" />
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">
        {work.title}
      </p>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {work.entryId !== null ? (
          "In your library"
        ) : (
          <>
            AniList
            <ExternalLink className="size-3" aria-hidden />
          </>
        )}
      </p>
    </>
  );

  const className =
    "block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return work.entryId !== null ? (
    <Link href={`/entry/${work.entryId}`} className={className}>
      {body}
    </Link>
  ) : (
    <a
      href={work.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${work.title} on AniList (opens in a new tab)`}
      className={className}
    >
      {body}
    </a>
  );
}
