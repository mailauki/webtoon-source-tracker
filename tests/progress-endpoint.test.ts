import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProgressState } from "@/lib/progress/save-progress";

const { saveProgress, createClient } = vi.hoisted(() => {
  const getClaims = vi.fn(async (token: string) =>
    token === "good"
      ? { data: { claims: { sub: "user-1" } }, error: null }
      : { data: null, error: new Error("invalid JWT") },
  );
  return {
    saveProgress: vi.fn<(...args: unknown[]) => Promise<ProgressState>>(async () => ({
      ok: true,
      message: "Saved to MyAnimeList.",
    })),
    createClient: vi.fn(() => ({ auth: { getClaims } })),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/progress/save-progress", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/progress/save-progress")>()),
  saveProgress,
}));

import { POST } from "@/app/api/entries/[id]/progress/route";

function call(id: string, body: unknown, token: string | null = "good") {
  const request = new Request(`https://example.com/api/entries/${id}/progress`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

describe("POST /api/entries/[id]/progress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs a valid app token", async () => {
    expect((await call("7", { numChaptersRead: 3 }, null)).status).toBe(401);
    expect((await call("7", { numChaptersRead: 3 }, "forged")).status).toBe(401);
    expect(saveProgress).not.toHaveBeenCalled();
  });

  it("saves as the token's user, with a client carrying that token", async () => {
    const response = await call("7", { numChaptersRead: 3, listStatus: "reading" });

    expect(response.status).toBe(200);
    expect(saveProgress).toHaveBeenCalledWith(expect.anything(), "user-1", {
      entryId: 7,
      numChaptersRead: 3,
      listStatus: "reading",
    });
    // RLS applies because the client sends the user's token, not a service key.
    expect(createClient).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.objectContaining({
        global: { headers: { Authorization: "Bearer good" } },
      }),
    );
  });

  it("takes the entry from the path, not the body", async () => {
    await call("7", { entryId: 99, score: 8 });
    expect(saveProgress).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ entryId: 7 }),
    );
  });

  it("rejects invalid values before saving", async () => {
    const response = await call("7", { score: 11 });
    expect(response.status).toBe(400);
    expect(saveProgress).not.toHaveBeenCalled();
  });

  it("passes a failed save back as a 400 with its message", async () => {
    saveProgress.mockResolvedValueOnce({ ok: false, error: "MyAnimeList is rate limiting us." });
    const response = await call("7", { numChaptersRead: 3 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "MyAnimeList is rate limiting us." });
  });
});
