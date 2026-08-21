import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

type ActionFn = (
  prev: unknown,
  formData: FormData,
) => Promise<{ error?: string; message?: string } | null>;

const { addEntrySource, updateEntrySource, removeEntrySource } = vi.hoisted(
  () => ({
    addEntrySource: vi.fn<ActionFn>(async () => ({ message: "Source added." })),
    updateEntrySource: vi.fn<ActionFn>(async () => ({
      message: "Source updated.",
    })),
    removeEntrySource: vi.fn<ActionFn>(async () => ({
      message: "Source removed.",
    })),
  }),
);
vi.mock("@/app/actions/entry-sources", () => ({
  addEntrySource,
  updateEntrySource,
  removeEntrySource,
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { EntrySourceDialog } from "@/components/entry-source-dialog";
import type { EntrySource } from "@/components/source-fields";
import type { Source } from "@/lib/data/rank-sources";

const CATALOG = [
  { id: 1, name: "Tapas", owner_id: null },
  { id: 2, name: "Webtoon", owner_id: null },
  { id: 3, name: "My scans", owner_id: "user-1" },
] as unknown as Source[];

const ATTACHED: EntrySource[] = [
  {
    id: 55,
    url: "https://tapas.io/series/x",
    chapters_read: 12,
    notes: "caught up",
    is_primary: true,
    is_official: true,
    is_paid: false,
    sources: { id: 1, name: "Tapas" },
  },
];

function setup(
  request: Parameters<typeof EntrySourceDialog>[0]["request"],
  attached = ATTACHED,
) {
  const onClose = vi.fn();
  render(
    <EntrySourceDialog
      entryId={7}
      entryTitle="Tower of God"
      request={request}
      attached={attached}
      catalog={CATALOG}
      onClose={onClose}
    />,
  );
  return { user: userEvent.setup(), onClose };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("entry source dialog", () => {
  it("renders nothing until a request opens it", () => {
    setup(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers only sources not already attached", () => {
    setup({ mode: "add" });

    expect(screen.getByRole("option", { name: "Webtoon" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Tapas" }),
    ).not.toBeInTheDocument();
  });

  it("separates the user's own sources from the catalog", () => {
    setup({ mode: "add" });

    const own = screen.getByRole("option", { name: "My scans" });
    expect(own.closest("optgroup")).toHaveAttribute("label", "Your sources");
  });

  it("submits a new source with the details typed into the form", async () => {
    const { user } = setup({ mode: "add" });

    await user.selectOptions(screen.getByLabelText("Source"), "2");
    await user.type(
      screen.getByLabelText(/Link/),
      "https://webtoons.com/series/y",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(addEntrySource).toHaveBeenCalledOnce());
    const formData = addEntrySource.mock.calls[0][1];
    expect(formData.get("entry_id")).toBe("7");
    expect(formData.get("source_id")).toBe("2");
    expect(formData.get("url")).toBe("https://webtoons.com/series/y");
  });

  it("prefills the form when editing an attached source", () => {
    setup({ mode: "edit", entrySourceId: 55 });

    expect(screen.getByLabelText(/Link/)).toHaveValue(
      "https://tapas.io/series/x",
    );
    expect(screen.getByLabelText(/Chapters read/)).toHaveValue(12);
    expect(screen.getByLabelText("Primary source")).toBeChecked();
  });

  it("does not offer to change which source an existing row points at", () => {
    setup({ mode: "edit", entrySourceId: 55 });
    expect(screen.queryByLabelText("Source")).not.toBeInTheDocument();
  });

  it("sends the row id when saving an edit, so it updates rather than adds", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 });

    await user.clear(screen.getByLabelText(/Link/));
    await user.type(screen.getByLabelText(/Link/), "https://tapas.io/series/z");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updateEntrySource).toHaveBeenCalledOnce());
    expect(addEntrySource).not.toHaveBeenCalled();
    const formData = updateEntrySource.mock.calls[0][1];
    expect(formData.get("id")).toBe("55");
    expect(formData.get("url")).toBe("https://tapas.io/series/z");
  });

  it("closes and reports success once a save goes through", async () => {
    const { user, onClose } = setup({ mode: "edit", entrySourceId: 55 });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith("Source updated.");
  });

  it("keeps the dialog open and toasts when the save is rejected", async () => {
    updateEntrySource.mockResolvedValueOnce({
      error: "Enter a valid URL (including https://).",
    } as never);

    const { user, onClose } = setup({ mode: "edit", entrySourceId: 55 });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Enter a valid URL (including https://).",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("asks before removing rather than detaching on the first click", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeEntrySource).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Really remove/ }),
    ).toBeInTheDocument();
  });

  it("removes the source once the removal is confirmed", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 });

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: /Really remove/ }));

    await vi.waitFor(() => expect(removeEntrySource).toHaveBeenCalledOnce());
    const formData = removeEntrySource.mock.calls[0][1];
    expect(formData.get("id")).toBe("55");
    expect(formData.get("entry_id")).toBe("7");
  });

  it("offers no removal when adding, since there is nothing to detach", () => {
    setup({ mode: "add" });
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
  });

  // Another tab can detach the row between opening the menu and picking it.
  it("renders nothing when the row an edit points at is gone", () => {
    setup({ mode: "edit", entrySourceId: 999 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
