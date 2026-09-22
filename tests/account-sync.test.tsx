import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The component imports the action module, which reaches server-only code.
const { runAccountSync } = vi.hoisted(() => ({
  runAccountSync:
    vi.fn<(prev: unknown, formData: FormData) => Promise<unknown>>(async () => ({
      ok: true,
      result: { toMal: 0, toAniList: 2, inSync: 5, unmatched: 0, remaining: 0, failed: 0 },
      message: "2 titles updated on AniList. 5 already matched.",
    })),
}));
vi.mock("@/app/actions/account-sync", () => ({ runAccountSync }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AccountSync } from "@/components/settings/account-sync";

afterEach(() => {
  cleanup();
  runAccountSync.mockClear();
});

describe("AccountSync", () => {
  // It writes to two accounts the app does not own; a stray click must not.
  it("asks before syncing, and does nothing on cancel", async () => {
    const user = userEvent.setup();
    render(<AccountSync lastSyncedLabel="Never synced" />);

    await user.click(screen.getByRole("button", { name: /sync accounts/i }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Nothing is deleted from either site.",
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(runAccountSync).not.toHaveBeenCalled();
  });

  it("names the side that can be overwritten for a one-way sync", async () => {
    const user = userEvent.setup();
    render(<AccountSync lastSyncedLabel="Never synced" />);

    await user.selectOptions(screen.getByLabelText("Sync direction"), "anilist_to_mal");
    await user.click(screen.getByRole("button", { name: /sync accounts/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Copy AniList to MyAnimeList?");
    expect(dialog).toHaveTextContent("MyAnimeList is overwritten");
  });

  it("sends the chosen direction once confirmed, and shows the summary", async () => {
    const user = userEvent.setup();
    render(<AccountSync lastSyncedLabel="Never synced" />);

    await user.selectOptions(screen.getByLabelText("Sync direction"), "mal_to_anilist");
    await user.click(screen.getByRole("button", { name: /sync accounts/i }));
    await user.click(await screen.findByRole("button", { name: "Sync" }));

    await waitFor(() => expect(runAccountSync).toHaveBeenCalledTimes(1));
    const formData = runAccountSync.mock.calls[0][1];
    expect(formData.get("direction")).toBe("mal_to_anilist");

    expect(
      await screen.findByText("2 titles updated on AniList. 5 already matched."),
    ).toBeInTheDocument();
  });
});
