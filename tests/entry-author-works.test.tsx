import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EntryAuthorWorks } from "@/components/entry-author-works";
import type { AuthorCredit, RelatedWork } from "@/lib/data/author-works";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);

const writer: AuthorCredit = { id: 10, name: "Writer", url: "https://anilist.co/staff/10", roles: ["Story"] };

function work(anilistId: number, entryId: number | null): RelatedWork {
  return {
    anilistId,
    malId: null,
    title: `Title ${anilistId}`,
    format: "MANGA",
    cover: null,
    isAdult: false,
    externalUrl: `https://anilist.co/manga/${anilistId}`,
    authorIds: [10],
    entryId,
  };
}

describe("EntryAuthorWorks", () => {
  it("is only the Pro teaser without Pro", () => {
    render(<EntryAuthorWorks isPro={false} />);
    expect(screen.getByRole("link", { name: /Get Pro/ })).toHaveAttribute("href", "/pro");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("links a tracked work to its entry page, and anything else to AniList", () => {
    render(<EntryAuthorWorks isPro authors={[writer]} works={[work(2, 7), work(3, null)]} />);

    expect(screen.getByRole("heading", { name: "More from Writer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Title 2/ })).toHaveAttribute("href", "/entry/7");
    const external = screen.getByRole("link", { name: /Title 3 on AniList/ });
    expect(external).toHaveAttribute("href", "https://anilist.co/manga/3");
    expect(external).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/1 in your library/)).toBeInTheDocument();
  });

  it("says so when the author made nothing else", () => {
    render(<EntryAuthorWorks isPro authors={[writer]} works={[]} />);
    expect(screen.getByText(/nothing else on AniList/)).toBeInTheDocument();
  });

  it("renders nothing when AniList credits no author", () => {
    const { container } = render(<EntryAuthorWorks isPro authors={[]} works={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
