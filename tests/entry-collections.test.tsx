import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The section imports the action module, which reaches server-only code.
const { addToCollection, removeFromCollection } = vi.hoisted(() => ({
  addToCollection: vi.fn<
    (prev: unknown, formData: FormData) => Promise<unknown>
  >(async () => ({ message: "Added." })),
  removeFromCollection: vi.fn<
    (prev: unknown, formData: FormData) => Promise<unknown>
  >(async () => ({ message: "Removed." })),
}));
vi.mock("@/app/actions/collections", () => ({
  addToCollection,
  removeFromCollection,
  createCollection: vi.fn(async () => ({ message: "Created." })),
  updateCollection: vi.fn(async () => ({ message: "Saved." })),
  deleteCollection: vi.fn(async () => ({ message: "Collection deleted." })),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { EntryCollections } from "@/components/entry-collections";
import type { CollectionTarget } from "@/lib/data/collection-items";

const TITLE_ID = 500;

const TARGETS: CollectionTarget[] = [
  {
    id: 11,
    name: "Comfort rereads",
    titleIds: [TITLE_ID],
    items: [{ id: 900, titleId: TITLE_ID }],
  },
  { id: 12, name: "To recommend", titleIds: [], items: [] },
];

afterEach(() => {
  cleanup();
  addToCollection.mockClear();
  removeFromCollection.mockClear();
  toastError.mockClear();
  refresh.mockClear();
});

describe("collections on the entry page", () => {
  it("lists every collection, in or out", () => {
    render(<EntryCollections titleId={TITLE_ID} collections={TARGETS} />);

    expect(screen.getByRole("button", { name: /Comfort rereads/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /To recommend/ })).toBeInTheDocument();
  });

  it("marks the collections holding the title as pressed", () => {
    render(<EntryCollections titleId={TITLE_ID} collections={TARGETS} />);

    expect(
      screen.getByRole("button", { name: /Comfort rereads/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /To recommend/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("adds the title when a collection it is not in is pressed", async () => {
    const user = userEvent.setup();
    render(<EntryCollections titleId={TITLE_ID} collections={TARGETS} />);

    await user.click(screen.getByRole("button", { name: /To recommend/ }));

    expect(addToCollection).toHaveBeenCalledOnce();
    const formData = addToCollection.mock.calls[0][1] as FormData;
    expect(formData.get("collection_id")).toBe("12");
    expect(formData.get("title_id")).toBe(String(TITLE_ID));
    expect(removeFromCollection).not.toHaveBeenCalled();
  });

  it("removes by item id when a collection it is in is pressed", async () => {
    // The remove action keys on collection_items.id, not the title.
    const user = userEvent.setup();
    render(<EntryCollections titleId={TITLE_ID} collections={TARGETS} />);

    await user.click(screen.getByRole("button", { name: /Comfort rereads/ }));

    expect(removeFromCollection).toHaveBeenCalledOnce();
    const formData = removeFromCollection.mock.calls[0][1] as FormData;
    expect(formData.get("item_id")).toBe("900");
    expect(formData.get("collection_id")).toBe("11");
    expect(addToCollection).not.toHaveBeenCalled();
  });

  it("flips the pill once the add settles", async () => {
    const user = userEvent.setup();
    render(<EntryCollections titleId={TITLE_ID} collections={TARGETS} />);

    await user.click(screen.getByRole("button", { name: /To recommend/ }));

    expect(
      await screen.findByRole("button", { name: /To recommend/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("reports a failure and leaves the pill alone", async () => {
    addToCollection.mockResolvedValueOnce({
      error: "That title is already in this collection.",
    });

    const user = userEvent.setup();
    render(<EntryCollections titleId={TITLE_ID} collections={TARGETS} />);

    await user.click(screen.getByRole("button", { name: /To recommend/ }));

    expect(toastError).toHaveBeenCalledWith(
      "That title is already in this collection.",
    );
    expect(
      screen.getByRole("button", { name: /To recommend/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("explains itself when there are no collections at all", () => {
    render(<EntryCollections titleId={TITLE_ID} collections={[]} />);

    expect(
      screen.getByText(/haven't made any collections yet/i),
    ).toBeInTheDocument();
  });

  it("points at /collections when there are none yet", () => {
    // Making one navigates away, so this section links rather than owning a
    // dialog that would throw away the entry page.
    render(<EntryCollections titleId={TITLE_ID} collections={[]} />);

    expect(screen.getByRole("link", { name: /Make one/ })).toHaveAttribute(
      "href",
      "/collections",
    );
  });
});
