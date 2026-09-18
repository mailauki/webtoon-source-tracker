import { describe, expect, it, vi } from "vitest";

import type { MalClient } from "@/lib/mal/client";
import { isMature, searchManga } from "@/lib/mal/endpoints";

/**
 * A stub standing in for MalClient, capturing the query it was asked for.
 *
 * `searchManga` only ever calls `request`, so nothing else needs to exist.
 */
function stubClient(nodes: { id: number; title: string; nsfw?: string }[]) {
  // Typed by signature rather than by inference, so `mock.calls` carries the
  // query argument these tests assert on.
  const request = vi.fn<
    (
      path: string,
      init?: { query?: Record<string, unknown> },
    ) => Promise<unknown>
  >(async () => ({ data: nodes.map((node) => ({ node })), paging: {} }));
  return { client: { request } as unknown as MalClient, request };
}

describe("isMature", () => {
  it("treats MAL's explicit ratings as mature", () => {
    expect(isMature({ nsfw: "black" })).toBe(true);
    expect(isMature({ nsfw: "gray" })).toBe(true);
  });

  it("treats the safe rating as not mature", () => {
    expect(isMature({ nsfw: "white" })).toBe(false);
  });

  // Failing open is deliberate. The query parameter has already asked MAL to
  // leave adult titles out, so an entry arriving with no rating has passed
  // that filter — and treating unknown as explicit would empty the results
  // rather than clean them.
  it("treats a missing or unknown rating as not mature", () => {
    expect(isMature({})).toBe(false);
    expect(isMature({ nsfw: undefined })).toBe(false);
    expect(isMature({ nsfw: null })).toBe(false);
    expect(isMature({ nsfw: "something-new" })).toBe(false);
  });
});

describe("searchManga", () => {
  const MIXED = [
    { id: 1, title: "Safe", nsfw: "white" },
    { id: 2, title: "Borderline", nsfw: "gray" },
    { id: 3, title: "Explicit", nsfw: "black" },
    { id: 4, title: "Unrated" },
  ];

  it("asks MAL to leave adult titles out by default", async () => {
    const { client, request } = stubClient(MIXED);
    await searchManga(client, "tower");

    expect(request).toHaveBeenCalledWith(
      "/manga",
      expect.objectContaining({
        query: expect.objectContaining({ nsfw: false }),
      }),
    );
  });

  // The second layer: MAL's own filtering is not something this app can
  // verify, so anything explicitly rated that arrives anyway is dropped here.
  it("drops anything explicitly rated that arrives anyway", async () => {
    const { client } = stubClient(MIXED);
    const page = await searchManga(client, "tower");

    expect(page.data.map((d) => d.node.id)).toEqual([1, 4]);
  });

  it("requests the rating field, or there would be nothing to filter on", async () => {
    const { client, request } = stubClient(MIXED);
    await searchManga(client, "tower");

    expect(request.mock.calls[0][1]?.query?.fields).toContain("nsfw");
  });

  it("returns everything when mature titles are asked for", async () => {
    const { client, request } = stubClient(MIXED);
    const page = await searchManga(client, "tower", 20, {
      includeMature: true,
    });

    expect(page.data.map((d) => d.node.id)).toEqual([1, 2, 3, 4]);
    expect(request).toHaveBeenCalledWith(
      "/manga",
      expect.objectContaining({
        query: expect.objectContaining({ nsfw: true }),
      }),
    );
  });

  it("passes the limit through", async () => {
    const { client, request } = stubClient(MIXED);
    await searchManga(client, "tower", 5);

    expect(request.mock.calls[0][1]?.query?.limit).toBe(5);
  });
});
