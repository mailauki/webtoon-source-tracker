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
    is_hiatus: false,
    is_owned: true,
    chapters_owned: "{[1,21)}",
    sources: { id: 1, name: "Tapas" },
  },
];

function setup(
  request: Parameters<typeof EntrySourceDialog>[0]["request"],
  attached = ATTACHED,
  total: Parameters<typeof EntrySourceDialog>[0]["total"] = null,
) {
  const onClose = vi.fn();
  render(
    <EntrySourceDialog
      entryId={7}
      entryTitle="Tower of God"
      request={request}
      attached={attached}
      catalog={CATALOG}
      total={total}
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
    expect(screen.getByLabelText("Owned")).toBeChecked();
    expect(screen.getByLabelText("Chapters owned")).toHaveValue("1-20");
  });

  it("submits ownership as its own flag and count", async () => {
    const { user } = setup({ mode: "add" });

    await user.selectOptions(screen.getByLabelText("Source"), "2");
    await user.click(screen.getByLabelText("Owned"));
    await user.type(screen.getByLabelText("Chapters owned"), "1-40, 55");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(addEntrySource).toHaveBeenCalledOnce());
    const formData = addEntrySource.mock.calls[0][1];
    expect(formData.get("is_owned")).toBe("on");
    expect(formData.get("chapters_owned")).toBe("1-40, 55");
  });

  // Two boxes, not one: the source charging money and the user having paid it
  // are different facts, and a coin-gated app you have never bought from is
  // the case the library toggle exists to surface.
  it("keeps paid and owned as independent flags", async () => {
    const { user } = setup({ mode: "add" });

    await user.selectOptions(screen.getByLabelText("Source"), "2");
    await user.click(screen.getByLabelText("Paid"));
    await user.click(screen.getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(addEntrySource).toHaveBeenCalledOnce());
    const formData = addEntrySource.mock.calls[0][1];
    expect(formData.get("is_paid")).toBe("on");
    expect(formData.get("is_owned")).toBeNull();
  });

  // The count field is always rendered rather than revealed by the Owned box.
  // Were it conditional, unticking Owned would unmount the input, the count
  // would submit as empty, and a hand-entered number would be gone.
  it("keeps the chapter count when the owned box is unticked", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 });

    await user.click(screen.getByLabelText("Owned"));
    expect(screen.getByLabelText("Owned")).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updateEntrySource).toHaveBeenCalledOnce());
    const formData = updateEntrySource.mock.calls[0][1];
    expect(formData.get("is_owned")).toBeNull();
    expect(formData.get("chapters_owned")).toBe("1-20");
  });

  // Blank is "owned, not counted" rather than "owns none" — the action turns
  // an empty string into null, which 0 would misreport.
  it("submits an empty count rather than a zero when it is left blank", async () => {
    const { user } = setup({ mode: "add" });

    await user.selectOptions(screen.getByLabelText("Source"), "2");
    await user.click(screen.getByLabelText("Owned"));
    await user.click(screen.getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(addEntrySource).toHaveBeenCalledOnce());
    expect(addEntrySource.mock.calls[0][1].get("chapters_owned")).toBe("");
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

/**
 * The count field is revealed by the Owned box rather than always shown.
 *
 * It is hidden with the `hidden` attribute and no display utility, so jsdom's
 * UA stylesheet applies and `toBeVisible` is meaningful here — a `hidden`
 * class would be inert in these tests, since no Tailwind CSS is loaded.
 */
describe("revealing the chapter count", () => {
  const count = () => screen.getByLabelText("Chapters owned");
  const ownedBox = () => screen.getByLabelText("Owned");

  it("hides the count on a source that is not owned", () => {
    setup({ mode: "add" });
    expect(count()).not.toBeVisible();
  });

  it("shows it straight away on a source that is", () => {
    // ATTACHED is owned, so opening its editor should not make the user tick
    // a box they have already ticked to see the number behind it.
    setup({ mode: "edit", entrySourceId: 55 });
    expect(count()).toBeVisible();
  });

  it("reveals it when the box is ticked", async () => {
    const { user } = setup({ mode: "add" });
    await user.click(ownedBox());
    expect(count()).toBeVisible();
  });

  it("hides it again when the box is unticked", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 });
    await user.click(ownedBox());
    expect(count()).not.toBeVisible();
  });

  // The reason it is hidden rather than unmounted. An unmounted input submits
  // nothing, so the count would be wiped by a glance at what the box does.
  it("still submits a hidden count, so unticking cannot wipe it", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 });

    await user.click(ownedBox());
    expect(count()).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updateEntrySource).toHaveBeenCalledOnce());
    const formData = updateEntrySource.mock.calls[0][1];
    expect(formData.get("is_owned")).toBeNull();
    expect(formData.get("chapters_owned")).toBe("1-20");
  });

  it("brings the same number back when the box is re-ticked", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 });

    await user.click(ownedBox());
    await user.click(ownedBox());

    expect(count()).toBeVisible();
    expect(count()).toHaveValue("1-20");
  });
});

describe("the own-all shortcut", () => {
  const FINISHED = { count: 179, final: true };
  const ONGOING = { count: 41, final: false };
  const button = (name: RegExp) => screen.getByRole("button", { name });

  it("fills the count with MAL's total for a finished series", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 }, ATTACHED, FINISHED);

    await user.click(button(/^Own all 179$/));
    expect(screen.getByLabelText("Chapters owned")).toHaveValue("1-179");
  });

  it("qualifies the total on a series still publishing", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 }, ATTACHED, ONGOING);

    await user.click(button(/Own all 41 so far/));
    expect(screen.getByLabelText("Chapters owned")).toHaveValue("1-41");
  });

  // A bare <button> in a form submits. If this one did, pressing it would save
  // the row rather than fill the field.
  it("does not submit the form", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 }, ATTACHED, FINISHED);

    await user.click(button(/^Own all 179$/));
    expect(updateEntrySource).not.toHaveBeenCalled();
  });

  it("sends the filled-in total when the row is then saved", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 }, ATTACHED, FINISHED);

    await user.click(button(/^Own all 179$/));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updateEntrySource).toHaveBeenCalledOnce());
    expect(updateEntrySource.mock.calls[0][1].get("chapters_owned")).toBe(
      "1-179",
    );
  });

  it("offers no shortcut when MAL has no count, and says why", async () => {
    const { user } = setup({ mode: "add" });
    await user.click(screen.getByLabelText("Owned"));

    expect(
      screen.queryByRole("button", { name: /Own all/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no chapter count for this title/)).toBeVisible();
  });

  // The shortcut lives inside the revealed block, so it is only reachable once
  // the user has said they own the title at all. It is out of the
  // accessibility tree entirely while hidden — which is why this asks by role
  // rather than by text, and why the DOM check below needs `hidden: true`.
  it("stays out of reach until the owned box is ticked", async () => {
    const { user } = setup({ mode: "add" }, ATTACHED, FINISHED);

    expect(
      screen.queryByRole("button", { name: /Own all/ }),
    ).not.toBeInTheDocument();
    // Present but hidden, not unmounted — the same block that keeps the count.
    expect(
      screen.getByRole("button", { name: /Own all 179/, hidden: true }),
    ).not.toBeVisible();

    await user.click(screen.getByLabelText("Owned"));
    expect(button(/^Own all 179$/)).toBeVisible();
  });
});

/**
 * The live preview under the field.
 *
 * A typed syntax needs a mirror, or the first anyone learns what the field
 * made of their input is after saving it.
 */
describe("the chapters-owned preview", () => {
  const field = () => screen.getByLabelText("Chapters owned");

  it("says what it understood", async () => {
    const { user } = setup({ mode: "add" });
    await user.click(screen.getByLabelText("Owned"));
    await user.type(field(), "1-40, 55, 60");

    expect(screen.getByText("42 chapters: 1–40, 55, 60")).toBeVisible();
  });

  // The rule that keeps a list meaning one thing: a lone number is one chapter.
  it("reads a bare number as a single chapter", async () => {
    const { user } = setup({ mode: "add" });
    await user.click(screen.getByLabelText("Owned"));
    await user.type(field(), "55");

    expect(screen.getByText("1 chapter: 55")).toBeVisible();
  });

  it("shows what overlapping entries collapse to", async () => {
    const { user } = setup({ mode: "add" });
    await user.click(screen.getByLabelText("Owned"));
    await user.type(field(), "1-40, 30-50");

    expect(screen.getByText("50 chapters: 1–50")).toBeVisible();
  });

  it("reports what it could not read, and marks the field invalid", async () => {
    const { user } = setup({ mode: "add" });
    await user.click(screen.getByLabelText("Owned"));
    await user.type(field(), "1-40, abc");

    expect(screen.getByText(/Could not read/)).toBeVisible();
    expect(field()).toHaveAttribute("aria-invalid", "true");
  });

  it("clears the invalid mark once the text parses again", async () => {
    const { user } = setup({ mode: "edit", entrySourceId: 55 });
    expect(field()).toHaveAttribute("aria-invalid", "false");

    await user.type(field(), ", abc");
    expect(field()).toHaveAttribute("aria-invalid", "true");

    // Correcting it must recover, not leave the field stuck invalid.
    await user.clear(field());
    await user.type(field(), "1-40");
    expect(field()).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("40 chapters: 1–40")).toBeVisible();
  });

  it("prefills from the stored multirange in the form the parser accepts", () => {
    // {[1,21)} is chapters 1-20 — the half-open upper bound is Postgres's,
    // and the field must never show it.
    setup({ mode: "edit", entrySourceId: 55 });
    expect(field()).toHaveValue("1-20");
    expect(screen.getByText("20 chapters: 1–20")).toBeVisible();
  });

  it("says MAL has no count when it has none", async () => {
    const { user } = setup({ mode: "add" });
    await user.click(screen.getByLabelText("Owned"));
    expect(screen.getByText(/no chapter count for this title/)).toBeVisible();
  });
});
