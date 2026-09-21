"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutGrid } from "lucide-react";

import { tagEmoji } from "@/lib/data/tag-emoji";
import {
  KIND_LABELS,
  PILLS_PER_GROUP,
  type Tag,
  type TagGroup,
} from "@/lib/data/tag-items";

/**
 * The category index above /discover's shelves.
 *
 * Every pill is a link to /discover/tag/<slug> — the page that already
 * answers "everything carrying this tag", and the page a title's own chips
 * have always gone to (components/entry-tags.tsx). This panel is the way in
 * for somebody who has not opened a title yet: until now those pages could
 * only be reached from a chip on a series you were already looking at, which
 * meant you had to know what you wanted before you could browse for it.
 *
 * It sits in the page body rather than in AppShell's sticky rows, where the
 * library keeps its filter control, and it is deliberately compact: four short
 * rows above the first shelf. A row pinned to the header is a row that is
 * always on screen, and /discover is a page about the collections under this
 * panel — the categories are a side door, not the content.
 *
 * A Client Component only for the per-group "show more". Nothing else here
 * holds state; the pills are plain links and work before hydration.
 */
export function CategoryNav({ groups }: { groups: TagGroup[] }) {
  // Per kind, not per page: genres and MAL's fifty-odd themes are the long
  // lists, and expanding one should not also unfold three formats nobody
  // asked about.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (groups.length === 0) return null;

  return (
    <section
      aria-labelledby="discover-categories"
      className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4"
    >
      <h2
        id="discover-categories"
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <LayoutGrid className="size-4 text-muted-foreground" />
        Browse by category
      </h2>

      {groups.map((group) => {
        const isExpanded = expanded.has(group.kind);
        const shown = isExpanded
          ? group.tags
          : group.tags.slice(0, PILLS_PER_GROUP);
        const hidden = group.tags.length - shown.length;

        return (
          <div key={group.kind} className="grid gap-2">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {KIND_LABELS[group.kind]}
            </h3>

            {/* One scrolling row per kind on a phone, wrapped once there is
                width for it. Wrapping at every size was what made this panel
                taller than the first shelf on a narrow screen — four kinds of
                three-per-row pills pushed the collections off the page, which
                is exactly the trade /discover should not make. Sideways is
                the gesture the shelves below already use. */}
            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0">
              {shown.map((tag) => (
                <li key={tag.id} className="shrink-0">
                  <CategoryPill tag={tag} />
                </li>
              ))}

              {/* Expanding is one-way per visit. Collapsing again would move
                  every pill under the cursor right after a click, and the
                  group is back to its short form on the next page load. */}
              {hidden > 0 ? (
                <li className="shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((current) => new Set(current).add(group.kind))
                    }
                    className="inline-flex h-8 shrink-0 items-center rounded-pill border border-dashed border-border px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    +{hidden} more
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/**
 * One category, as a pill linking to its tag page.
 *
 * The glyph is `aria-hidden`. It is decoration chosen by slug, and an emoji
 * read aloud before every category name would triple the length of the row
 * without adding a word of meaning — the link's accessible name should be the
 * category, which is what the page it opens is called.
 */
function CategoryPill({ tag }: { tag: Tag }) {
  return (
    <Link
      href={`/discover/tag/${tag.slug}`}
      title={tag.description ?? undefined}
      className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-border bg-card py-1 pr-3 pl-1 text-[13px] font-medium whitespace-nowrap text-foreground shadow-sm transition-colors hover:border-brand hover:bg-brand hover:text-brand-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-pill bg-muted text-xs leading-none"
      >
        {tagEmoji(tag)}
      </span>
      {tag.name}
    </Link>
  );
}
