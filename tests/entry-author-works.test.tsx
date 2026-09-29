import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The add button imports both add actions, which reach server-only code.
vi.mock("@/app/actions/add-entry", () => ({ addEntry: vi.fn(async () => null) }));
vi.mock("@/app/actions/add-anilist-entry", () => ({
  addAniListEntry: vi.fn(async () => null),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { EntryAuthorWorks } from "@/components/entry-author-works";
import { AuthorCheck, EntryAuthors } from "@/components/entry-authors";
import type { MergedAuthor, RelatedWork } from "@/lib/data/author-works";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);

const writer: MergedAuthor = {
  key: "mal:1",
  name: "Writer",
  roles: ["Story"],
  mal: { id: 1, url: "https://myanimelist.net/people/1", roles: ["Story"] },
  anilist: { id: 10, url: "https://anilist.co/staff/10", roles: ["Story"] },
};

function work(anilistId: number, entryId: number | null, malId: number | null = anilistId + 1000): RelatedWork {
  return {
    anilistId,
    malId,
    title: `Title ${anilistId}`,
    format: "MANGA",
    cover: null,
    isAdult: false,
    entryId,
  };
}

describe("EntryAuthorWorks", () => {
  it("is only the Pro teaser without Pro", () => {
    render(<EntryAuthorWorks isPro={false} />);
    expect(screen.getByRole("link", { name: /Get Pro/ })).toHaveAttribute("href", "/pro");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("links a tracked work to its entry page, and offers to add anything else", () => {
    render(
      <EntryAuthorWorks isPro authors={[writer]} works={[work(2, 7), work(3, null)]} anilistConnected={false} />,
    );

    expect(screen.getByRole("heading", { name: "More from Writer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Title 2/ })).toHaveAttribute("href", "/entry/7");
    expect(screen.queryByRole("link", { name: /Title 3/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByText(/1 in your library/)).toBeInTheDocument();
  });

  it("asks for AniList to add a title MyAnimeList does not have", () => {
    const { rerender } = render(
      <EntryAuthorWorks isPro authors={[writer]} works={[work(3, null, null)]} anilistConnected={false} />,
    );
    expect(screen.getByRole("link", { name: "Connect AniList to add" })).toHaveAttribute(
      "href",
      "/api/anilist/connect",
    );

    rerender(<EntryAuthorWorks isPro authors={[writer]} works={[work(3, null, null)]} anilistConnected />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("says so when the author made nothing else", () => {
    render(<EntryAuthorWorks isPro authors={[writer]} works={[]} anilistConnected />);
    expect(screen.getByText(/Nothing else of theirs/)).toBeInTheDocument();
  });

  it("renders nothing when no site credits an author", () => {
    const { container } = render(
      <EntryAuthorWorks isPro authors={[]} works={[]} anilistConnected />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EntryAuthors", () => {
  it("names each author with their credit, linked to MyAnimeList first", () => {
    const artist: MergedAuthor = {
      key: "anilist:20",
      name: "Artist",
      roles: ["Art"],
      mal: null,
      anilist: { id: 20, url: "https://anilist.co/staff/20", roles: ["Art"] },
    };
    render(<EntryAuthors authors={[writer, artist]} />);

    expect(screen.getByRole("link", { name: "Writer" })).toHaveAttribute("href", "https://myanimelist.net/people/1");
    expect(screen.getByRole("link", { name: "Artist" })).toHaveAttribute("href", "https://anilist.co/staff/20");
    expect(screen.getByText(/By/)).toHaveTextContent("By Writer (Story), Artist (Art)");
  });

  it("renders nothing without authors", () => {
    const { container } = render(<EntryAuthors authors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AuthorCheck", () => {
  it("lists each disagreement, and is silent without one", () => {
    const { container, rerender } = render(<AuthorCheck mismatches={[]} />);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <AuthorCheck
        mismatches={[
          { kind: "missing", name: "Only On Mal", creditedBy: "mal" },
          { kind: "roles", name: "Writer", mal: "Story & Art", anilist: "Story" },
        ]}
      />,
    );
    expect(screen.getByText("Only On Mal is credited on MyAnimeList only.")).toBeInTheDocument();
    expect(screen.getByText("Writer: Story & Art on MyAnimeList, Story on AniList.")).toBeInTheDocument();
  });
});
