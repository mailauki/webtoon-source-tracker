import { describe, expect, it, vi } from "vitest";

import type { AniListClient } from "@/lib/anilist/client";
import {
  findMediaByMalIds,
  saveListEntries,
  type AniListEntryWrite,
} from "@/lib/anilist/endpoints";
import { AniListApiError, AniListAuthError } from "@/lib/anilist/errors";

type Request = (query: string, variables?: Record<string, unknown>) => Promise<unknown>;

function stubClient(impl: Request) {
  const request = vi.fn<Request>(impl);
  return { client: { request } as unknown as AniListClient, request };
}

function write(mediaId: number): AniListEntryWrite {
  return { mediaId, status: "CURRENT", progress: 1, progressVolumes: 0, scoreRaw: 0 };
}

describe("saveListEntries", () => {
  it("sends up to ten entries per request as aliased mutations", async () => {
    const { client, request } = stubClient(async () => ({}));
    const writes = Array.from({ length: 23 }, (_, i) => write(i + 1));

    const result = await saveListEntries(client, writes);

    expect(result).toEqual({ saved: 23, failed: [] });
    expect(request).toHaveBeenCalledTimes(3);
    const [query, variables] = request.mock.calls[0];
    expect(query).toContain("e9: SaveMediaListEntry");
    expect(query).not.toContain("e10:");
    expect(variables).toMatchObject({ m0: 1, s0: "CURRENT", r0: 0 });
  });

  it("retries a rejected batch one entry at a time", async () => {
    const { client, request } = stubClient(async (_query, variables) => {
      // The batch fails, then only media 2 fails on its own.
      if (variables && "m1" in variables) throw new AniListApiError("bad", 400);
      if (variables?.m0 === 2) throw new AniListApiError("bad", 400);
      return {};
    });

    const result = await saveListEntries(client, [write(1), write(2), write(3)]);

    expect(result.saved).toBe(2);
    expect(result.failed).toEqual([write(2)]);
    expect(request).toHaveBeenCalledTimes(4);
  });

  // It would fail identically for every entry; retrying them only burns quota.
  it("does not retry an auth failure entry by entry", async () => {
    const { client, request } = stubClient(async () => {
      throw new AniListAuthError();
    });

    await expect(saveListEntries(client, [write(1), write(2)])).rejects.toBeInstanceOf(
      AniListAuthError,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("findMediaByMalIds", () => {
  it("maps MAL ids to AniList ids, keeping the first match", async () => {
    const { client } = stubClient(async () => ({
      Page: {
        pageInfo: { hasNextPage: false },
        media: [
          { id: 100, idMal: 1 },
          { id: 101, idMal: 1 },
          { id: 200, idMal: 2 },
        ],
      },
    }));

    const found = await findMediaByMalIds(client, [1, 2, 3]);
    expect([...found]).toEqual([
      [1, 100],
      [2, 200],
    ]);
  });

  it("asks in batches of fifty ids", async () => {
    const { client, request } = stubClient(async () => ({
      Page: { pageInfo: { hasNextPage: false }, media: [] },
    }));

    await findMediaByMalIds(client, Array.from({ length: 120 }, (_, i) => i + 1));
    expect(request).toHaveBeenCalledTimes(3);
    expect((request.mock.calls[2][1]?.ids as number[]).length).toBe(20);
  });
});
