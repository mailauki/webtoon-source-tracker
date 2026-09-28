import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EntryHeader } from "@/components/entry-header";
import type { EntryDetail } from "@/lib/data/entries";
import type { Tag } from "@/lib/data/tag-items";

/**
 * The header's format badge is the format tag.
 *
 * The title's kind and its format tag used to show separately, as a badge in
 * the header and a chip among the tags — the same fact twice. They are one
 * badge now, linking to the format's tag page, and the chip is gone (see
 * entry-tags.test.tsx).
 */

function entry(kind: string | null): EntryDetail {
  return {
    id: 1,
    list_status: "reading",
    num_chapters_read: 3,
    num_volumes_read: 0,
    score: 0,
    is_rereading: false,
    archived_at: null,
    media_titles: {
      id: 10,
      mal_media_id: 1,
      anilist_media_id: null,
      title: "Na Honjaman Level Up",
      title_en: "Solo Leveling",
      alt_titles: [],
      main_picture_url: null,
      mal_media_kind: kind,
      num_chapters: 200,
      num_volumes: null,
      mal_status: "finished",
    },
    entry_sources: [],
  } as unknown as EntryDetail;
}

const MANHWA: Tag = {
  id: 9,
  slug: "manhwa",
  name: "Manhwa",
  description: null,
  kind: "format",
  mal_genre_id: null,
  sort_order: 20,
  is_active: true,
};

afterEach(cleanup);

describe("the entry header's format badge", () => {
  it("links to the format's tag page", () => {
    render(<EntryHeader entry={entry("manhwa")} formatTag={MANHWA} />);
    expect(screen.getByRole("link", { name: "Manhwa" })).toHaveAttribute(
      "href",
      "/discover/tag/manhwa",
    );
  });

  it("falls back to the kind as plain text when there is no format tag", () => {
    render(<EntryHeader entry={entry("light_novel")} />);
    expect(screen.getByText("light novel")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /light novel/i })).toBeNull();
  });

  it("shows no format badge for a title with no kind", () => {
    render(<EntryHeader entry={entry(null)} />);
    expect(screen.queryByText(/manhwa|manga|novel/i)).toBeNull();
  });
});
