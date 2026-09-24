import { afterEach, expect, it, vi } from "vitest";

const { updateProgress, addEntrySource, removeEntry, attached, sites } = vi.hoisted(
  () => ({
    updateProgress: vi.fn(),
    addEntrySource: vi.fn(),
    removeEntry: vi.fn(),
    attached: { rows: [] as { entry_id: number }[] },
    sites: {
      rows: [] as {
        id: number;
        media_titles: { mal_media_id: number | null; anilist_media_id: number | null };
      }[],
    },
  }),
);
vi.mock("@/app/actions/progress", () => ({ updateProgress }));
vi.mock("@/app/actions/entry-sources", () => ({ addEntrySource }));
vi.mock("@/app/actions/remove-entry", () => ({
  removeEntry,
  restoreEntry: vi.fn(),
}));
vi.mock("@/lib/auth/dal", () => ({
  verifySession: async () => ({ userId: "u" }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ in: async () => ({ data: attached.rows }) }),
        in: async () => ({ data: sites.rows }),
      }),
    }),
  }),
}));

import { bulkEdit } from "@/app/actions/bulk-edit";

afterEach(() => vi.clearAllMocks());

it("stops a status run at a rate limit and reports the rest as skipped", async () => {
  updateProgress
    .mockResolvedValueOnce({ ok: true, message: "" })
    .mockResolvedValueOnce({ ok: false, error: "slow down", rateLimited: true });

  const result = await bulkEdit([1, 2, 3, 4], {
    kind: "status",
    status: "completed",
  });

  expect(result).toEqual({
    applied: [1],
    failed: [{ entryId: 2, error: "slow down" }],
    skipped: [3, 4],
  });
  expect(updateProgress).toHaveBeenCalledTimes(2);
});

it("counts an already-attached source as applied without inserting it", async () => {
  attached.rows = [{ entry_id: 2 }];
  addEntrySource.mockResolvedValue({ message: "Source added." });

  const result = await bulkEdit([1, 2], { kind: "source", sourceId: 9 });

  expect(result.applied).toEqual([1, 2]);
  expect(addEntrySource).toHaveBeenCalledTimes(1);
});

it("keeps going past a failed removal", async () => {
  removeEntry
    .mockResolvedValueOnce({ ok: false, error: "nope" })
    .mockResolvedValueOnce({ ok: true, message: "" });

  const result = await bulkEdit([1, 2], {
    kind: "remove",
    fromLibrary: true,
    fromMal: false,
    fromAniList: false,
  });

  expect(result).toEqual({
    applied: [2],
    failed: [{ entryId: 1, error: "nope" }],
    skipped: [],
  });
  expect(removeEntry.mock.calls[0][1].get("from_library")).toBe("on");
});

it("removes from a site only the titles that are on it", async () => {
  sites.rows = [
    { id: 1, media_titles: { mal_media_id: 10, anilist_media_id: null } },
    { id: 2, media_titles: { mal_media_id: null, anilist_media_id: 20 } },
  ];
  removeEntry.mockResolvedValue({ ok: true, message: "" });

  const result = await bulkEdit([1, 2], {
    kind: "remove",
    fromLibrary: false,
    fromMal: true,
    fromAniList: false,
  });

  // 2 is not on MyAnimeList: nothing to do, so it is not sent at all.
  expect(result.applied).toEqual([1, 2]);
  expect(removeEntry).toHaveBeenCalledTimes(1);
  const sent = removeEntry.mock.calls[0][1];
  expect(sent.get("entry_id")).toBe("1");
  expect(sent.get("from_mal")).toBe("on");
  expect(sent.get("from_library")).toBeNull();
});
