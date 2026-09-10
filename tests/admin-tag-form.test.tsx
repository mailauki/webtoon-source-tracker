import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The form imports the action module, which reaches server-only code.
const { createTag, updateTag } = vi.hoisted(() => ({
  createTag: vi.fn<(prev: unknown, formData: FormData) => Promise<unknown>>(
    async () => ({ message: "Created “Isekai”.", tagId: 7 }),
  ),
  updateTag: vi.fn<(prev: unknown, formData: FormData) => Promise<unknown>>(
    async () => ({ message: "Saved." }),
  ),
}));
vi.mock("@/app/actions/tags", () => ({
  createTag,
  updateTag,
  deleteTag: vi.fn(async () => ({ message: "Tag deleted." })),
  tagTitle: vi.fn(async () => ({ message: "Tagged." })),
  untagTitle: vi.fn(async () => ({ message: "Removed." })),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { TagForm } from "@/components/admin/tag-form";

afterEach(() => {
  cleanup();
  createTag.mockClear();
  updateTag.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  refresh.mockClear();
});

describe("the tag form", () => {
  it("calls createTag with the typed name in the FormData", async () => {
    const user = userEvent.setup();
    render(<TagForm />);

    await user.type(screen.getByLabelText(/name/i), "Isekai");
    await user.click(screen.getByRole("button", { name: /create tag/i }));

    expect(createTag).toHaveBeenCalledOnce();
    const formData = createTag.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("Isekai");
  });

  it("renders the error an action comes back with", async () => {
    createTag.mockResolvedValueOnce({
      error: "A tag with that name already exists.",
    });

    const user = userEvent.setup();
    render(<TagForm />);

    await user.type(screen.getByLabelText(/name/i), "Isekai");
    await user.click(screen.getByRole("button", { name: /create tag/i }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("A tag with that name already exists.");
  });

  it("defaults the kind to trope", () => {
    // `genre` is what MAL's import writes; a tag invented here is a trope
    // until somebody says otherwise, so that is the default the form offers.
    render(<TagForm />);

    expect(screen.getByLabelText(/kind/i)).toHaveValue("trope");
  });

  it("sends the default kind even when the selector is left alone", async () => {
    const user = userEvent.setup();
    render(<TagForm />);

    await user.type(screen.getByLabelText(/name/i), "Isekai");
    await user.click(screen.getByRole("button", { name: /create tag/i }));

    const formData = createTag.mock.calls[0][1] as FormData;
    expect(formData.get("kind")).toBe("trope");
  });

  it("edits an existing tag through updateTag, carrying its id", async () => {
    const user = userEvent.setup();
    render(
      <TagForm
        tag={{
          id: 42,
          slug: "isekai",
          name: "Isekai",
          description: null,
          kind: "trope",
          mal_genre_id: null,
          sort_order: 100,
          is_active: true,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateTag).toHaveBeenCalledOnce();
    expect(createTag).not.toHaveBeenCalled();
    const formData = updateTag.mock.calls[0][1] as FormData;
    expect(formData.get("id")).toBe("42");
    expect(formData.get("name")).toBe("Isekai");
  });

  it("keeps an existing tag's kind rather than resetting it to trope", () => {
    // The `trope` default is for new tags only — an imported genre must not
    // silently become a trope because somebody fixed its description.
    render(
      <TagForm
        tag={{
          id: 42,
          slug: "romance",
          name: "Romance",
          description: null,
          kind: "genre",
          mal_genre_id: 22,
          sort_order: 100,
          is_active: true,
        }}
      />,
    );

    expect(screen.getByLabelText(/kind/i)).toHaveValue("genre");
  });
});
