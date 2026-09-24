import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { bulkEdit, toast } = vi.hoisted(() => ({
  bulkEdit: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/app/actions/bulk-edit", () => ({ bulkEdit }));
vi.mock("@/app/actions/library-prefs", () => ({ saveLibraryPrefs: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// The real card is not under test; this one exposes the selection it is given.
vi.mock("@/components/entry-card", () => ({
  EntryCard: ({
    entry,
    selection,
  }: {
    entry: { id: number };
    selection?: { checked: boolean; onToggle: () => void };
  }) =>
    selection ? (
      <button aria-pressed={selection.checked} onClick={selection.onToggle}>
        {`pick ${entry.id}`}
      </button>
    ) : null,
}));

import {
  LibraryFilters,
  LibraryGrid,
  SelectToggle,
} from "@/components/library-grid";
import { DEFAULT_SORT } from "@/lib/data/library-prefs";
import type { LibraryRow } from "@/lib/data/entries";

const ROWS = [1, 2, 3].map(
  (id) =>
    ({
      id,
      list_status: "reading",
      media_titles: { title: `T${id}`, title_en: null },
      entry_sources: [],
    }) as unknown as LibraryRow,
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderShelf() {
  render(
    <LibraryFilters initial={{ sort: DEFAULT_SORT, status: "", source: "" }}>
      <SelectToggle />
      <LibraryGrid
        entries={ROWS}
        emptyFiltered={null}
        emptyUnfiltered={null}
      />
    </LibraryFilters>,
  );
}

it("asks where to remove from, defaulting to the library only", async () => {
  bulkEdit.mockResolvedValue({ applied: [1, 2, 3], failed: [], skipped: [] });
  renderShelf();

  await userEvent.click(screen.getByRole("button", { name: "Select" }));
  await userEvent.click(screen.getByRole("button", { name: "All" }));
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Remove…" }));

  expect(
    (screen.getByRole("checkbox", { name: /From my library/ }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  await userEvent.click(screen.getByRole("checkbox", { name: /From AniList/ }));
  await userEvent.click(screen.getByRole("button", { name: "Remove 3 titles" }));

  expect(bulkEdit).toHaveBeenCalledWith([1, 2, 3], {
    kind: "remove",
    fromLibrary: true,
    fromMal: false,
    fromAniList: true,
  });
});

it("applies one status to the picks and keeps the failures picked", async () => {
  bulkEdit.mockResolvedValue({
    applied: [1],
    failed: [{ entryId: 2, error: "MyAnimeList is rate limiting us." }],
    skipped: [3],
  });

  render(
    <LibraryFilters initial={{ sort: DEFAULT_SORT, status: "", source: "" }}>
      <SelectToggle />
      <LibraryGrid
        entries={ROWS}
        emptyFiltered={null}
        emptyUnfiltered={null}
      />
    </LibraryFilters>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Select" }));
  await userEvent.click(screen.getByRole("button", { name: "All" }));
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Set status" }),
  );
  await userEvent.click(await screen.findByRole("menuitem", { name: "On hold" }));

  expect(bulkEdit).toHaveBeenCalledWith([1, 2, 3], {
    kind: "status",
    status: "on_hold",
  });
  expect(toast.error).toHaveBeenCalledWith("1 of 3 marked On hold.", {
    description: "MyAnimeList is rate limiting us.",
  });
  expect(screen.getByText("2 selected")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "pick 1" }).getAttribute("aria-pressed"),
  ).toBe("false");
});
