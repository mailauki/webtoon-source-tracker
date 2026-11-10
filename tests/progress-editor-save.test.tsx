import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

type State = { ok: true; message: string } | { ok: false; error: string } | null;

const { updateProgress } = vi.hoisted(() => ({
  updateProgress: vi.fn<(prev: unknown, data: FormData) => Promise<State>>(),
}));
vi.mock("@/app/actions/progress", () => ({ updateProgress }));

import { ProgressEditor } from "@/components/progress-editor";
import type { EntryDetail } from "@/lib/data/entries";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function entry(over: Partial<{ chapters: number; status: string; score: number }> = {}): EntryDetail {
  return {
    id: 1,
    list_status: over.status ?? "reading",
    num_chapters_read: over.chapters ?? 3,
    num_volumes_read: 0,
    score: over.score ?? 0,
    is_rereading: false,
    sync_to_mal: true,
    sync_to_anilist: false,
    media_titles: { id: 10, mal_media_id: 1, anilist_media_id: null, num_chapters: 100 },
  } as unknown as EntryDetail;
}

/** An action that stays in flight until the test lets it go. */
function deferredSave() {
  let finish!: (state: State) => void;
  updateProgress.mockImplementationOnce(
    () => new Promise<State>((resolve) => (finish = resolve)),
  );
  return (state: State) => act(async () => finish(state));
}

const saveButton = () => screen.getByRole("button", { name: /^Sav/ });
const exact = () => screen.getByLabelText("Set exactly") as HTMLInputElement;

describe("saving progress", () => {
  it("shows the save in flight on the button itself", async () => {
    const finish = deferredSave();
    render(<ProgressEditor entry={entry()} />);

    await userEvent.click(saveButton());

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Saving…");

    await finish({ ok: true, message: "Saved to MyAnimeList." });
    expect(saveButton()).toHaveTextContent("Save to MyAnimeList");
    expect(saveButton()).toBeEnabled();
  });

  it("moves the count at once and holds it while the save is in flight", async () => {
    const finish = deferredSave();
    render(<ProgressEditor entry={entry()} />);

    await userEvent.click(screen.getByRole("button", { name: "One chapter forward" }));
    expect(screen.getByText("4", { selector: "span" })).toBeInTheDocument();

    // A failed save hands the stored count back.
    await finish({ ok: false, error: "MyAnimeList rejected the update" });
    expect(screen.getByText("3", { selector: "span" })).toBeInTheDocument();
  });

  // The discrepancy: the exact-chapters box was a defaultValue, so after a
  // save or a +1 it kept the old number while the count beside it moved on.
  it("follows the saved row once the save's re-render lands", () => {
    const { rerender } = render(<ProgressEditor entry={entry()} />);
    expect(exact().value).toBe("3");

    rerender(<ProgressEditor entry={entry({ chapters: 100, status: "completed", score: 8 })} />);

    expect(exact().value).toBe("100");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("completed");
    expect((screen.getByLabelText("Score") as HTMLSelectElement).value).toBe("8");
  });

  it("counts up to the live total once it streams in, without remounting", async () => {
    let resolve!: (total: number | null) => void;
    const live = new Promise<number | null>((r) => (resolve = r));
    render(<ProgressEditor entry={entry()} liveTotal={live} />);

    await userEvent.clear(exact());
    await userEvent.type(exact(), "42");
    expect(screen.getByText("/ 100")).toBeInTheDocument();

    await act(async () => resolve(120));

    expect(screen.getByText("/ 120")).toBeInTheDocument();
    // What was typed survives the live answer arriving.
    expect(exact().value).toBe("42");
  });
});
