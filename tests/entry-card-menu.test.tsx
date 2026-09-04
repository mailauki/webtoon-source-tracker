import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above every const, so the spy has to be hoisted with it.
const { updateProgress } = vi.hoisted(() => ({
  updateProgress: vi.fn<
    (prev: unknown, formData: FormData) => Promise<ProgressState>
  >(async () => ({ ok: true, message: "Saved" })),
}));
vi.mock("@/app/actions/progress", () => ({ updateProgress }));

// The dialog imports these actions, which reach through to server-only code.
const { addEntrySource } = vi.hoisted(() => ({
  addEntrySource: vi.fn<
    (
      prev: unknown,
      formData: FormData,
    ) => Promise<{ error?: string; message?: string } | null>
  >(async () => ({ message: "Source added." })),
}));
vi.mock("@/app/actions/entry-sources", () => ({
  addEntrySource,
  updateEntrySource: vi.fn(async () => ({ message: "Source updated." })),
  removeEntrySource: vi.fn(async () => ({ message: "Source removed." })),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

import type { ProgressState } from "@/app/actions/progress";
import { EntryCard } from "@/components/entry-card";
import {
  addableSources,
  linkableSources,
  nextStatus,
  quickAddSource,
} from "@/components/entry-card-menu";
import type { LibraryRow } from "@/lib/data/entries";

function row(overrides: Partial<LibraryRow> = {}): LibraryRow {
  return {
    id: 7,
    list_status: "reading",
    num_chapters_read: 41,
    entry_sources: [],
    media_titles: {
      title: "Tower of God",
      num_chapters: 179,
      main_picture_url: null,
    },
    ...overrides,
  } as unknown as LibraryRow;
}

/** Radix opens on a real contextmenu event; userEvent has no helper for it. */
const TOP_SOURCES = [
  { id: 1, name: "Tapas", count: 9 },
  { id: 2, name: "Webtoon", count: 4 },
];

async function openMenu(entry: LibraryRow = row()) {
  const user = userEvent.setup();
  render(<EntryCard entry={entry} topSources={TOP_SOURCES} />);
  await user.pointer({
    keys: "[MouseRight]",
    // Anchored: the card also carries a "Read … on …" link now.
    target: screen.getByRole("link", { name: /^Tower of God/ }),
  });
  return user;
}

afterEach(() => {
  cleanup();
  // `restoreMocks` restores spies but leaves vi.fn() call history intact.
  updateProgress.mockClear();
  toastError.mockClear();
});

describe("entry card quick-access menu", () => {
  it("stays closed until the card is right-clicked", () => {
    render(<EntryCard entry={row()} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens a menu on right-click", async () => {
    await openMenu();
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("submits one more chapter than the entry has read", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    );

    expect(updateProgress).toHaveBeenCalledOnce();
    const formData = updateProgress.mock.calls[0][1];
    expect(formData.get("entry_id")).toBe("7");
    expect(formData.get("num_chapters_read")).toBe("42");
  });

  it("disables Add 1 chapter once every chapter is read", async () => {
    await openMenu(row({ num_chapters_read: 179 }));

    expect(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("allows Add 1 chapter on an ongoing series with no known total", async () => {
    await openMenu(
      row({
        num_chapters_read: 500,
        media_titles: {
          title: "Tower of God",
          num_chapters: null,
          main_picture_url: null,
        },
      } as unknown as Partial<LibraryRow>),
    );

    expect(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("offers completing a title that is being read", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "Mark as completed" }),
    );

    expect(updateProgress).toHaveBeenCalledOnce();
    const formData = updateProgress.mock.calls[0][1];
    expect(formData.get("entry_id")).toBe("7");
    expect(formData.get("list_status")).toBe("completed");
  });

  it("offers re-reading a title that is already completed", async () => {
    const user = await openMenu(row({ list_status: "completed" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Mark as reading" }),
    );

    expect(updateProgress.mock.calls[0][1].get("list_status")).toBe("reading");
  });

  it("shows only one status move, not the full list", async () => {
    await openMenu();

    await screen.findByRole("menuitem", { name: "Mark as completed" });
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Plan to read" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces a failed save as a toast instead of silently dropping it", async () => {
    updateProgress.mockResolvedValueOnce({
      ok: false,
      error: "MyAnimeList rejected the update",
    } as never);

    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    );

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "MyAnimeList rejected the update",
      ),
    );
  });

  it("does not toast an error when the save succeeds", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    );

    await vi.waitFor(() => expect(updateProgress).toHaveBeenCalledOnce());
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("source shortcuts", () => {
  it("offers every top source when the entry has none attached", () => {
    expect(addableSources([], TOP_SOURCES).map((s) => s.name)).toEqual([
      "Tapas",
      "Webtoon",
    ]);
  });

  it("does not offer a source the entry already has", () => {
    const attached = [{ sources: { id: 1 } }];

    expect(addableSources(attached, TOP_SOURCES).map((s) => s.name)).toEqual([
      "Webtoon",
    ]);
  });

  it("offers nothing once every top source is attached", () => {
    const attached = [{ sources: { id: 1 } }, { sources: { id: 2 } }];
    expect(addableSources(attached, TOP_SOURCES)).toEqual([]);
  });

  // A source row that failed to join must not knock out a real shortcut.
  it("ignores attachments whose source did not join", () => {
    expect(addableSources([{ sources: null }], TOP_SOURCES)).toHaveLength(2);
  });

  it("attaches a source with no url, leaving the details for later", async () => {
    await quickAddSource({ id: 7 }, 2);

    expect(addEntrySource).toHaveBeenCalledOnce();
    const formData = addEntrySource.mock.calls[0][1];
    expect(formData.get("entry_id")).toBe("7");
    expect(formData.get("source_id")).toBe("2");
    expect(formData.get("url")).toBeNull();
  });
});

describe("go-to shortcuts", () => {
  const withSource = (url: string | null) =>
    row({
      entry_sources: [
        { id: 3, url, is_primary: true, sources: { id: 1, name: "Tapas" } },
      ],
    } as unknown as Partial<LibraryRow>);

  it("always offers the in-app entry page", async () => {
    await openMenu();

    const link = await screen.findByRole("menuitem", { name: "Go to entry" });
    expect(link).toHaveAttribute("href", "/entry/7");
  });

  it("links an attached source that has a url", async () => {
    await openMenu(withSource("https://tapas.io/series/tog"));

    const link = await screen.findByRole("menuitem", { name: "Go to Tapas" });
    expect(link).toHaveAttribute("href", "https://tapas.io/series/tog");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides a source quick-added without a url", async () => {
    await openMenu(withSource(null));

    await screen.findByRole("menuitem", { name: "Go to entry" });
    expect(
      screen.queryByRole("menuitem", { name: "Go to Tapas" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a url-less source reachable for editing", async () => {
    await openMenu(withSource(null));

    expect(
      await screen.findByRole("menuitem", { name: "Edit Tapas" }),
    ).toBeInTheDocument();
  });

  it("drops sources whose url is only whitespace", () => {
    const attached = [
      { id: 1, url: "   ", sources: { id: 1, name: "Tapas" } },
      { id: 2, url: "https://x.test", sources: { id: 2, name: "Webtoon" } },
    ] as unknown as LibraryRow["entry_sources"];

    expect(linkableSources(attached).map((es) => es.id)).toEqual([2]);
  });

  it("drops an attachment whose source did not join", () => {
    const attached = [
      { id: 1, url: "https://x.test", sources: null },
    ] as unknown as LibraryRow["entry_sources"];

    expect(linkableSources(attached)).toEqual([]);
  });
});

describe("nextStatus", () => {
  it("moves a title being read to completed", () => {
    expect(nextStatus("reading")).toEqual({
      value: "completed",
      label: "Mark as completed",
    });
  });

  it("offers a re-read once completed", () => {
    expect(nextStatus("completed")?.value).toBe("reading");
  });

  it.each(["on_hold", "dropped", "plan_to_read"])(
    "resumes reading from %s",
    (status) => {
      expect(nextStatus(status)).toEqual({
        value: "reading",
        label: "Start reading",
      });
    },
  );

  it("offers nothing for a status it does not know", () => {
    expect(nextStatus("something_else")).toBeNull();
  });
});
