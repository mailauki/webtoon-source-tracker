import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RefreshEvent } from "@/lib/sync/refresh-library";

const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast }));

import { SyncButton } from "@/components/sync-button";

/** A streamed response the test releases line by line. */
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { status: 200 }),
    send: (event: RefreshEvent) =>
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")),
    close: () => controller.close(),
  };
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const button = () => screen.getByRole("button", { name: /refresh library/i });

/**
 * Refresh library: the library's quiet, read-only sync.
 *
 * Named apart from "Copy between sites" on /settings, which writes. These pin
 * the name, the progress bar the stream drives, and that what happened
 * arrives as a toast rather than as text that reflows the header.
 */
describe("SyncButton", () => {
  it("is named for refreshing, and reads as the last-synced time", () => {
    render(<SyncButton lastSyncedLabel="Synced 2h ago" stale={false} />);

    expect(button()).toHaveTextContent("Synced 2h ago");
    expect(button()).not.toHaveAccessibleName(/due/i);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("says when a refresh is due", () => {
    render(<SyncButton lastSyncedLabel="Synced 2d ago" stale />);

    expect(button()).toHaveAccessibleName(/due for a refresh/i);
  });

  it("shows progress as the refresh streams, then reports the result", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    render(<SyncButton lastSyncedLabel="Synced 2h ago" stale={false} />);

    await userEvent.click(button());

    expect(fetchMock).toHaveBeenCalledWith("/api/library-refresh", {
      method: "POST",
    });
    expect(button()).toBeDisabled();
    expect(button()).toHaveTextContent("Refreshing…");

    act(() =>
      stream.send({
        type: "progress",
        step: "Reading your MyAnimeList list",
        value: 0.42,
      }),
    );

    const bar = await screen.findByRole("progressbar", { name: "Refresh progress" });
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "42"));
    expect(screen.getByText("Reading your MyAnimeList list…")).toBeInTheDocument();

    act(() => {
      stream.send({ type: "done", message: "12 titles synced." });
      stream.close();
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("12 titles synced."),
    );
    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(),
    );
    expect(button()).toBeEnabled();
    expect(refresh).toHaveBeenCalled();
  });

  it("reports a failed refresh as an error toast", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    render(<SyncButton lastSyncedLabel="Synced 2h ago" stale={false} />);

    await userEvent.click(button());
    act(() => {
      stream.send({ type: "error", error: "MyAnimeList is down." });
      stream.close();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("MyAnimeList is down."),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  // The server ran out of time: no `done` or `error` line ever came.
  it("says so when the stream ends without finishing", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    render(<SyncButton lastSyncedLabel="Synced 2h ago" stale={false} />);

    await userEvent.click(button());
    act(() => {
      stream.send({ type: "progress", step: "Updating titles", value: 0.5 });
      stream.close();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "The refresh was cut off before it finished. Run it again to continue.",
      ),
    );
  });

  it("reports a refresh the server refused to start", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "Not signed in" }, { status: 401 }),
    );
    render(<SyncButton lastSyncedLabel="Synced 2h ago" stale={false} />);

    await userEvent.click(button());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not signed in"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
