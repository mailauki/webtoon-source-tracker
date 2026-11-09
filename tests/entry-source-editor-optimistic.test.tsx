import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

type State = { error?: string; message?: string } | null;
type ActionFn = (prev: unknown, formData: FormData) => Promise<State>;

const { addEntrySource, updateEntrySource, removeEntrySource } = vi.hoisted(() => ({
  addEntrySource: vi.fn<ActionFn>(async () => ({ message: "Source added." })),
  updateEntrySource: vi.fn<ActionFn>(async () => ({ message: "Source updated." })),
  removeEntrySource: vi.fn<ActionFn>(async () => ({ message: "Source removed." })),
}));
vi.mock("@/app/actions/entry-sources", () => ({
  addEntrySource,
  updateEntrySource,
  removeEntrySource,
}));
vi.mock("@/app/actions/custom-sources", () => ({
  createCustomSource: vi.fn(async () => ({ message: "Source created." })),
}));

import { EntrySourceEditor } from "@/components/entry-source-editor";
import type { EntrySource } from "@/components/source-fields";
import type { Source } from "@/lib/data/rank-sources";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const tapas: EntrySource = {
  id: 55,
  url: null,
  chapters_read: 10,
  notes: null,
  is_primary: false,
  is_official: true,
  is_paid: false,
  is_hiatus: false,
  is_owned: false,
  chapters_owned: null,
  sources: { id: 1, name: "Tapas" },
};

const catalog: Source[] = [
  { id: 1, slug: "tapas", name: "Tapas", base_url: null, logo_url: null, owner_id: null, parent_slug: null, sort_order: null },
  { id: 2, slug: "webtoon", name: "WEBTOON", base_url: null, logo_url: null, owner_id: null, parent_slug: null, sort_order: null },
];

function pending(fn: typeof updateEntrySource) {
  let finish!: (state: State) => void;
  fn.mockImplementationOnce(() => new Promise<State>((resolve) => (finish = resolve)));
  return (state: State) => act(async () => finish(state));
}

describe("source edits show before the page re-renders", () => {
  it("shows the save in flight, then the saved row once the page re-renders", async () => {
    const finish = pending(updateEntrySource);
    const { rerender } = render(
      <EntrySourceEditor entryId={7} sources={[tapas]} catalog={catalog} isPro />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit Tapas" }));
    const read = screen.getByLabelText("Chapters read here");
    await userEvent.clear(read);
    await userEvent.type(read, "25");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

    await finish({ message: "Source updated." });
    rerender(
      <EntrySourceEditor
        entryId={7}
        sources={[{ ...tapas, chapters_read: 25 }]}
        catalog={catalog}
        isPro
      />,
    );
    expect(screen.getByText("Up to chapter 25 here")).toBeInTheDocument();
  });

  it("keeps the form and what was typed when the save is refused", async () => {
    const finish = pending(updateEntrySource);
    render(<EntrySourceEditor entryId={7} sources={[tapas]} catalog={catalog} isPro />);

    await userEvent.click(screen.getByRole("button", { name: "Edit Tapas" }));
    const read = screen.getByLabelText("Chapters read here");
    await userEvent.clear(read);
    await userEvent.type(read, "25");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await finish({ error: "Something went wrong." });

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByLabelText("Chapters read here")).toHaveValue(25);
  });

  it("shows an added source at once, before its save returns", async () => {
    const finish = pending(addEntrySource);
    render(<EntrySourceEditor entryId={7} sources={[tapas]} catalog={catalog} isPro />);

    await userEvent.click(screen.getByRole("button", { name: /add source/i }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Source" }), "2");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    const row = screen.getByText("WEBTOON").closest("li");
    expect(row).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("2 sources")).toBeInTheDocument();

    // Settled, so the next test's optimistic state is not held behind it:
    // React reverts optimistic values only once every pending action ends.
    await finish({ message: "Source added." });
  });

  it("hides a removed row at once and brings it back if the removal fails", async () => {
    const finish = pending(removeEntrySource);
    render(<EntrySourceEditor entryId={7} sources={[tapas]} catalog={catalog} isPro />);

    await userEvent.click(screen.getByRole("button", { name: "Remove source" }));
    expect(screen.getByText("Tapas")).not.toBeVisible();
    expect(screen.getByText("No source recorded yet.")).toBeInTheDocument();

    await finish({ error: "Could not remove that source." });
    expect(screen.getByText("Tapas")).toBeVisible();
  });

  // The editor used to be swapped for a second one behind Suspense when
  // AniList answered, which closed whatever form was open.
  it("keeps an open form open when AniList's links stream in", async () => {
    let resolve!: (links: Record<number, string>) => void;
    const links = new Promise<Record<number, string>>((r) => (resolve = r));
    render(
      <EntrySourceEditor
        entryId={7}
        sources={[tapas]}
        catalog={catalog}
        isPro
        liveAnilistLinks={links}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /add source/i }));
    await act(async () => resolve({ 2: "https://www.webtoons.com/x" }));

    expect(screen.getByRole("combobox", { name: "Source" })).toBeInTheDocument();
    expect(screen.getByText("Add from AniList")).toBeInTheDocument();
  });
});
