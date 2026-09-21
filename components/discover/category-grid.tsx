import Link from "next/link";

import { tagEmoji } from "@/lib/data/tag-emoji";
import { KIND_LABELS, type Tag, type TagGroup } from "@/lib/data/tag-items";

/**
 * Every category, grouped by kind — the body of /discover/categories.
 *
 * Each pill is a link to /discover/tag/<slug>, the page that already answers
 * "everything carrying this tag", and the page a title's own chips have always
 * gone to (components/entry-tags.tsx). This grid is the way in for somebody
 * who has not opened a title yet: until now those pages could only be reached
 * from a chip on a series you were already looking at, which meant you had to
 * know what you wanted before you could browse for it.
 *
 * A Server Component, and nothing here holds state. The categories briefly
 * lived on /discover itself, where they had to be capped per kind and unfolded
 * with a button so they could not push the first shelf off the screen. On a
 * page of their own there is nothing to compete with, so every category shows
 * at once and the whole thing renders without a line of client JavaScript.
 */
export function CategoryGrid({ groups }: { groups: TagGroup[] }) {
  return (
    <div className="grid gap-6">
      {groups.map((group) => (
        <section key={group.kind} className="grid gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {KIND_LABELS[group.kind]}
          </h2>

          <ul className="flex flex-wrap gap-2">
            {group.tags.map((tag) => (
              <li key={tag.id}>
                <CategoryPill tag={tag} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * One category, as a pill linking to its tag page.
 *
 * The glyph is `aria-hidden`. It is decoration chosen by slug, and an emoji
 * read aloud before every category name would triple the length of the list
 * without adding a word of meaning — the link's accessible name should be the
 * category, which is what the page it opens is called.
 */
function CategoryPill({ tag }: { tag: Tag }) {
  return (
    <Link
      href={`/discover/tag/${tag.slug}`}
      title={tag.description ?? undefined}
      className="inline-flex h-10 items-center gap-2 rounded-pill border border-border bg-card py-1 pr-4 pl-1.5 text-sm font-medium whitespace-nowrap text-foreground shadow-sm transition-colors hover:border-brand hover:bg-brand hover:text-brand-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-pill bg-muted text-sm leading-none"
      >
        {tagEmoji(tag)}
      </span>
      {tag.name}
    </Link>
  );
}
