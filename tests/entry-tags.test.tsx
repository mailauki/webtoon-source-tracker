import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The section imports the action module, which reaches server-only code.
const { tagTitle, untagTitle } = vi.hoisted(() => ({
  tagTitle: vi.fn<(prev: unknown, formData: FormData) => Promise<unknown>>(
    async () => ({ message: "Tagged." }),
  ),
  untagTitle: vi.fn<(prev: unknown, formData: FormData) => Promise<unknown>>(
    async () => ({ message: "Removed." }),
  ),
}));
vi.mock("@/app/actions/tags", () => ({
  tagTitle,
  untagTitle,
  createTag: vi.fn(async () => ({ message: "Created." })),
  updateTag: vi.fn(async () => ({ message: "Saved." })),
  deleteTag: vi.fn(async () => ({ message: "Tag deleted." })),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { EntryTags } from "@/components/entry-tags";
import type { Tag } from "@/lib/data/tag-items";

const TITLE_ID = 500;

function makeTag(overrides: Partial<Tag>): Tag {
  return {
    id: 1,
    slug: "isekai",
    name: "Isekai",
    description: null,
    kind: "genre",
    mal_genre_id: null,
    sort_order: 100,
    is_active: true,
    ...overrides,
  };
}

const ROMANCE = makeTag({ id: 1, slug: "romance", name: "Romance" });
const ISEKAI = makeTag({ id: 2, slug: "isekai", name: "Isekai" });

afterEach(() => {
  cleanup();
  tagTitle.mockClear();
  untagTitle.mockClear();
  toastError.mockClear();
  refresh.mockClear();
});

describe("tags on the entry page", () => {
  it("renders nothing for a reader when the title has no tags", () => {
    const { container } = render(
      <EntryTags titleId={TITLE_ID} tags={[]} allTags={[]} isAdmin={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows tag chips linking to /discover/tag/<slug> for a reader", () => {
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[]}
        isAdmin={false}
      />,
    );

    const link = screen.getByRole("link", { name: "Romance" });
    expect(link).toHaveAttribute("href", "/discover/tag/romance");
  });

  it("does not show the editor for a non-admin reader", () => {
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[ROMANCE, ISEKAI]}
        isAdmin={false}
      />,
    );

    expect(
      screen.queryByRole("combobox", { name: /add a tag/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the editor for an admin even when the title has no tags", () => {
    render(
      <EntryTags titleId={TITLE_ID} tags={[]} allTags={[ISEKAI]} isAdmin />,
    );

    expect(
      screen.getByRole("combobox", { name: /add a tag/i }),
    ).toBeInTheDocument();
  });

  it("lets an admin remove a tag, calling untagTitle with its ids", async () => {
    const user = userEvent.setup();
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[ROMANCE]}
        isAdmin
      />,
    );

    await user.click(screen.getByRole("button", { name: /Remove tag Romance/i }));

    expect(untagTitle).toHaveBeenCalledOnce();
    const formData = untagTitle.mock.calls[0][1] as FormData;
    expect(formData.get("tag_id")).toBe(String(ROMANCE.id));
    expect(formData.get("title_id")).toBe(String(TITLE_ID));
  });

  it("lets an admin add an untagged tag, calling tagTitle with its ids", async () => {
    const user = userEvent.setup();
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[ROMANCE, ISEKAI]}
        isAdmin
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /add a tag/i }),
      String(ISEKAI.id),
    );
    await user.click(screen.getByRole("button", { name: /^Tag$/ }));

    expect(tagTitle).toHaveBeenCalledOnce();
    const formData = tagTitle.mock.calls[0][1] as FormData;
    expect(formData.get("tag_id")).toBe(String(ISEKAI.id));
    expect(formData.get("title_id")).toBe(String(TITLE_ID));
  });

  it("offers only tags not already on the title", () => {
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[ROMANCE, ISEKAI]}
        isAdmin
      />,
    );

    const select = screen.getByRole("combobox", { name: /add a tag/i });
    expect(
      screen.queryByRole("option", { name: "Romance" }),
    ).not.toBeInTheDocument();
    expect(select).toHaveTextContent("Isekai");
  });

  it("tells the admin there is nothing left to add once every tag is applied", () => {
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[ROMANCE]}
        isAdmin
      />,
    );

    expect(screen.getByText(/no more tags to add/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /add a tag/i }),
    ).not.toBeInTheDocument();
  });

  it("reports a failure when removing a tag fails", async () => {
    untagTitle.mockResolvedValueOnce({ error: "Something went wrong." });

    const user = userEvent.setup();
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[ROMANCE]}
        isAdmin
      />,
    );

    await user.click(screen.getByRole("button", { name: /Remove tag Romance/i }));

    expect(toastError).toHaveBeenCalledWith("Something went wrong.");
  });
});
