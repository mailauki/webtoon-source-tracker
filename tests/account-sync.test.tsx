import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountSyncEvent, UnmatchedTitle } from "@/lib/sync/plan-account-sync";

const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast }));

import { AccountSync } from "@/components/settings/account-sync";
import { readSyncEvents } from "@/lib/sync/read-sync-events";

const DONE: AccountSyncEvent = {
  type: "done",
  result: {
    toMal: 0,
    toAniList: 2,
    inSync: 5,
    unmatched: 1,
    remaining: 0,
    excluded: 0,
    failed: 0,
    unmatchedTitles: [{ onlyOn: "anilist", id: 77, title: "Only On AniList" }],
  },
  message: "2 titles updated on AniList. 5 already matched.",
};

/**
 * A streamed response the test releases line by line, so it can look at the
 * page between progress events.
 */
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
    send: (event: AccountSyncEvent) =>
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")),
    close: () => controller.close(),
  };
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockClear();
  toast.error.mockClear();
  toast.success.mockClear();
});

async function confirmSync(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /sync accounts/i }));
  await user.click(await screen.findByRole("button", { name: "Sync" }));
}

describe("AccountSync", () => {
  // It writes to two accounts the app does not own; a stray click must not.
  it("asks before syncing, and does nothing on cancel", async () => {
    const user = userEvent.setup();
    render(<AccountSync lastSyncedLabel="Never synced" unmatchedTitles={[]} />);

    await user.click(screen.getByRole("button", { name: /sync accounts/i }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Nothing is deleted from either site.",
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the side that can be overwritten for a one-way sync", async () => {
    const user = userEvent.setup();
    render(<AccountSync lastSyncedLabel="Never synced" unmatchedTitles={[]} />);

    await user.selectOptions(screen.getByLabelText("Sync direction"), "anilist_to_mal");
    await user.click(screen.getByRole("button", { name: /sync accounts/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Copy AniList to MyAnimeList?");
    expect(dialog).toHaveTextContent("MyAnimeList is overwritten");
  });

  it("sends the chosen direction, shows progress, then the summary", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);

    const user = userEvent.setup();
    render(<AccountSync lastSyncedLabel="Never synced" unmatchedTitles={[]} />);

    await user.selectOptions(screen.getByLabelText("Sync direction"), "mal_to_anilist");
    await confirmSync(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/account-sync");
    expect(JSON.parse(init!.body as string)).toEqual({ direction: "mal_to_anilist" });

    await act(async () => {
      stream.send({ type: "progress", step: "Saving to AniList (10 of 40)", value: 0.42 });
    });

    const bar = await screen.findByRole("progressbar");
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "42"));
    expect(screen.getByText("Saving to AniList (10 of 40)…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /syncing/i })).toBeDisabled();

    await act(async () => {
      stream.send(DONE);
      stream.close();
    });

    expect(
      await screen.findByText("2 titles updated on AniList. 5 already matched."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Accounts synced.");
    expect(refresh).toHaveBeenCalled();

    // The run's unmatched titles replace whatever the page loaded with.
    expect(screen.getByText("1 title not matched between the two sites")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Only On AniList" })).toHaveAttribute(
      "href",
      "https://anilist.co/manga/77",
    );
  });

  it("reports an error line from the stream", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);

    const user = userEvent.setup();
    render(<AccountSync lastSyncedLabel="Never synced" unmatchedTitles={[]} />);
    await confirmSync(user);

    await act(async () => {
      stream.send({ type: "error", error: "AniList is rate limiting us. Try again in a minute." });
      stream.close();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "AniList is rate limiting us. Try again in a minute.",
      ),
    );
    expect(screen.getByRole("button", { name: /sync accounts/i })).toBeEnabled();
  });

  it("says so when the stream ends without finishing", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);

    const user = userEvent.setup();
    render(<AccountSync lastSyncedLabel="Never synced" unmatchedTitles={[]} />);
    await confirmSync(user);

    await act(async () => {
      stream.send({ type: "progress", step: "Reading your lists", value: 0.02 });
      stream.close();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "The sync was cut off before it finished. Run it again to continue.",
      ),
    );
  });

  it("lists the last run's unmatched titles with links to both sites", async () => {
    const titles: UnmatchedTitle[] = [
      { onlyOn: "anilist", id: 5, title: "Webtoon A" },
      { onlyOn: "mal", id: 9, title: "Manga B" },
    ];
    render(<AccountSync lastSyncedLabel="Synced today" unmatchedTitles={titles} />);

    expect(screen.getByText("2 titles not matched between the two sites")).toBeInTheDocument();
    expect(screen.getByText(/On AniList, not matched on MyAnimeList \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/On MyAnimeList, not found on AniList \(1\)/)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Manga B" })).toHaveAttribute(
      "href",
      "https://myanimelist.net/manga/9",
    );
    expect(screen.getByRole("link", { name: /search anilist/i })).toHaveAttribute(
      "href",
      "https://anilist.co/search/manga?search=Manga%20B",
    );
    expect(screen.getByRole("link", { name: /search myanimelist/i })).toHaveAttribute(
      "href",
      "https://myanimelist.net/manga.php?q=Webtoon%20A&cat=manga",
    );
  });
});

describe("readSyncEvents", () => {
  // Network chunks do not respect line boundaries.
  it("reassembles lines split across chunks", async () => {
    const text =
      JSON.stringify({ type: "progress", step: "A", value: 0.5 }) +
      "\n" +
      JSON.stringify({ type: "error", error: "x" }) +
      "\n";
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });

    const events: AccountSyncEvent[] = [];
    await readSyncEvents(body, (e) => events.push(e));

    expect(events).toEqual([
      { type: "progress", step: "A", value: 0.5 },
      { type: "error", error: "x" },
    ]);
  });
});
