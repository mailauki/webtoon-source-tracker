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

/**
 * Renders as an admin and turns edit mode on.
 *
 * The editing controls are behind an Edit toggle, so every admin test starts
 * by pressing it. Kept as a helper rather than repeated so that a change to
 * how edit mode is entered is one edit here, not nine.
 */
async function renderEditing(props: {
  tags: Tag[];
  allTags: Tag[];
}) {
  const user = userEvent.setup();
  const result = render(
    <EntryTags
      titleId={TITLE_ID}
      tags={props.tags}
      allTags={props.allTags}
      isAdmin
    />,
  );
  await user.click(screen.getByRole("button", { name: /^Edit$/ }));
  return { user, ...result };
}

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

  it("shows the editor for an admin even when the title has no tags", async () => {
    await renderEditing({ tags: [], allTags: [ISEKAI] });

    expect(
      screen.getByRole("combobox", { name: /add a tag/i }),
    ).toBeInTheDocument();
  });

  it("lets an admin remove a tag, calling untagTitle with its ids", async () => {
    const { user } = await renderEditing({
      tags: [ROMANCE],
      allTags: [ROMANCE],
    });

    await user.click(screen.getByRole("button", { name: /Remove tag Romance/i }));

    expect(untagTitle).toHaveBeenCalledOnce();
    const formData = untagTitle.mock.calls[0][1] as FormData;
    expect(formData.get("tag_id")).toBe(String(ROMANCE.id));
    expect(formData.get("title_id")).toBe(String(TITLE_ID));
  });

  it("lets an admin add an untagged tag, calling tagTitle with its ids", async () => {
    const { user } = await renderEditing({
      tags: [ROMANCE],
      allTags: [ROMANCE, ISEKAI],
    });

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

  it("offers only tags not already on the title", async () => {
    await renderEditing({ tags: [ROMANCE], allTags: [ROMANCE, ISEKAI] });

    const select = screen.getByRole("combobox", { name: /add a tag/i });
    expect(
      screen.queryByRole("option", { name: "Romance" }),
    ).not.toBeInTheDocument();
    expect(select).toHaveTextContent("Isekai");
  });

  it("tells the admin there is nothing left to add once every tag is applied", async () => {
    await renderEditing({ tags: [ROMANCE], allTags: [ROMANCE] });

    expect(screen.getByText(/no more tags to add/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /add a tag/i }),
    ).not.toBeInTheDocument();
  });

  it("reports a failure when removing a tag fails", async () => {
    untagTitle.mockResolvedValueOnce({ error: "Something went wrong." });

    const { user } = await renderEditing({
      tags: [ROMANCE],
      allTags: [ROMANCE],
    });

    await user.click(screen.getByRole("button", { name: /Remove tag Romance/i }));

    expect(toastError).toHaveBeenCalledWith("Something went wrong.");
  });

  // --- the Edit toggle -----------------------------------------------------

  it("shows no Edit button to a reader", () => {
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[ROMANCE, ISEKAI]}
        isAdmin={false}
      />,
    );

    // Absent, not merely disabled: a reader has no business seeing the
    // control at all.
    expect(
      screen.queryByRole("button", { name: /^Edit$/ }),
    ).not.toBeInTheDocument();
  });

  it("hides the editing controls until an admin presses Edit", () => {
    render(
      <EntryTags
        titleId={TITLE_ID}
        tags={[ROMANCE]}
        allTags={[ROMANCE, ISEKAI]}
        isAdmin
      />,
    );

    expect(screen.getByRole("button", { name: /^Edit$/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /add a tag/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove tag Romance/i }),
    ).not.toBeInTheDocument();
  });

  it("shows chips as links until editing, and as remove buttons after", async () => {
    const { user } = await renderEditing({
      tags: [ROMANCE],
      allTags: [ROMANCE],
    });

    // In edit mode the chip is a remove button, not a link — so a stray click
    // on what looks like a link cannot delete a tag.
    expect(
      screen.getByRole("button", { name: /Remove tag Romance/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Romance" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Done$/ }));

    // Back to the reader's view, which is the point of the toggle: an admin
    // can follow the chip through to its tag page.
    expect(screen.getByRole("link", { name: "Romance" })).toHaveAttribute(
      "href",
      "/discover/tag/romance",
    );
  });

  it("marks the toggle pressed so a screen reader announces the mode", async () => {
    const { user } = await renderEditing({ tags: [], allTags: [ISEKAI] });

    const done = screen.getByRole("button", { name: /^Done$/ });
    expect(done).toHaveAttribute("aria-pressed", "true");

    await user.click(done);
    expect(screen.getByRole("button", { name: /^Edit$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
