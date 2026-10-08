import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { runSync, toast } = vi.hoisted(() => ({
  runSync: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/actions/sync", () => ({ runSync }));
vi.mock("sonner", () => ({ toast }));

import { SyncButton } from "@/components/sync-button";

afterEach(cleanup);

/**
 * Refresh library: the library's quiet, read-only sync.
 *
 * Named apart from "Copy between sites" on /settings, which writes. These pin
 * the name, that a press always forces a run, and that what happened arrives
 * as a toast rather than as text that reflows the header.
 */
describe("SyncButton", () => {
  it("is named for refreshing, and reads as the last-synced time", () => {
    render(<SyncButton lastSyncedLabel="Synced 2h ago" stale={false} />);

    const button = screen.getByRole("button", { name: /refresh library/i });
    expect(button).toHaveTextContent("Synced 2h ago");
    expect(button).not.toHaveAccessibleName(/due/i);
  });

  it("says when a refresh is due", () => {
    render(<SyncButton lastSyncedLabel="Synced 2d ago" stale />);

    expect(
      screen.getByRole("button", { name: /refresh library/i }),
    ).toHaveAccessibleName(/due for a refresh/i);
  });

  it("forces a run and reports the result as a toast", async () => {
    runSync.mockResolvedValue({
      ok: true,
      message: "12 titles synced.",
      result: {},
    });
    render(<SyncButton lastSyncedLabel="Synced 2h ago" stale={false} />);

    await userEvent.click(screen.getByRole("button", { name: /refresh library/i }));

    expect(runSync).toHaveBeenCalledTimes(1);
    const formData = runSync.mock.calls[0][1] as FormData;
    expect(formData.get("force")).toBe("1");
    expect(await vi.waitFor(() => toast.success.mock.calls[0])).toEqual([
      "12 titles synced.",
    ]);
  });

  it("reports a failure as an error toast", async () => {
    runSync.mockResolvedValue({ ok: false, error: "MyAnimeList is down." });
    render(<SyncButton lastSyncedLabel="Synced 2h ago" stale={false} />);

    await userEvent.click(screen.getByRole("button", { name: /refresh library/i }));

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("MyAnimeList is down."),
    );
  });
});
