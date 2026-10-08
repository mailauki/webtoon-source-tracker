import Link from "next/link";

import { AddTitleButton } from "@/components/add-title-button";
import { CoverImage } from "@/components/cover-image";
import { ProTeaser } from "@/components/pro-teaser";
import type { MergedAuthor, RelatedWork } from "@/lib/data/author-works";

/**
 * "More from this author": the other titles the title's authors made.
 *
 * A title the reader tracks opens its entry page; anything else can be added
 * from here, the same as from a discover shelf. The works come from AniList
 * and MyAnimeList (see lib/data/author-works.ts), so a title nobody here
 * tracks still shows.
 *
 * Pro. Without it the section is only the teaser, and the page never asks
 * AniList for the works it would have shown.
 */
export function EntryAuthorWorks(
  props:
    | { isPro: false }
    | {
        isPro: true;
        authors: MergedAuthor[];
        works: RelatedWork[];
        /** Whether a title only AniList has can be added, or only connected. */
        anilistConnected: boolean;
      },
) {
  if (!props.isPro) {
    return (
      <Section heading="More from the author">
        <ProTeaser feature="authors" />
      </Section>
    );
  }

  const { authors, works, anilistConnected } = props;
  // Neither site credits an author for this title (or neither could be
  // reached): there is nobody to name, and "nothing else by nobody" says
  // nothing.
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
        {works.length === 0
          ? "Nothing else of theirs on MyAnimeList or AniList."
          : tracked > 0
            ? `${tracked} in your library.`
            : "None in your library yet."}
      </p>

      {works.length > 0 ? (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {works.map((work) => (
            <li key={work.anilistId ?? `mal-${work.malId}`} className="grid w-[110px] shrink-0 snap-start content-start gap-1.5">
              <WorkCard work={work} anilistConnected={anilistConnected} />
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

function WorkCard({
  work,
  anilistConnected,
}: {
  work: RelatedWork;
  anilistConnected: boolean;
}) {
  const body = (
    <>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
        <CoverImage src={work.cover} title={work.title} sizes="110px" />
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">
        {work.title}
      </p>
    </>
  );

  if (work.entryId !== null) {
    return (
      <Link
        href={`/entry/${work.entryId}`}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
        <p className="text-xs text-muted-foreground">In your library</p>
      </Link>
    );
  }

  // Not a link: there is no page in the app for a title the reader does not
  // track, and the add is what this card is for. Once it lands the page
  // refreshes and the card comes back as the link above.
  return (
    <>
      <div>{body}</div>
      <AddTitleButton
        malMediaId={work.malId}
        anilistMediaId={work.anilistId}
        anilistConnected={anilistConnected}
        name={work.title}
      />
    </>
  );
}
