import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { canLinkService, userClientFromBearer } = vi.hoisted(() => ({
  canLinkService: vi.fn(async () => true),
  userClientFromBearer: vi.fn(async () => ({ supabase: {}, userId: "user-1" })),
}));

vi.mock("@/lib/data/pro", () => ({ canLinkService }));
vi.mock("@/lib/auth/app-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/app-link")>()),
  userClientFromBearer,
}));

import { POST as malConnect } from "@/app/api/mal/connect/route";
import { POST as anilistConnect } from "@/app/api/anilist/connect/route";

const request = () =>
  new Request("https://example.com/api/x/connect", {
    method: "POST",
    headers: { authorization: "Bearer good" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  vi.stubEnv("MAL_CLIENT_ID", "mal-client");
  vi.stubEnv("MAL_REDIRECT_URI", "https://example.com/api/mal/callback");
  vi.stubEnv("ANILIST_CLIENT_ID", "anilist-client");
  vi.stubEnv("ANILIST_REDIRECT_URI", "https://example.com/api/anilist/callback");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("linking a second service", () => {
  it("refuses with 402 when the other service is linked and there is no Pro", async () => {
    canLinkService.mockResolvedValueOnce(false);
    const response = await anilistConnect(request());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: "Syncing to both MyAnimeList and AniList is part of Pro.",
    });
    expect(canLinkService).toHaveBeenCalledWith({}, "user-1", "anilist");
  });

  it("allows relinking the service already linked", async () => {
    // canLinkService only looks at the *other* table; true here stands for
    // "MAL is the one linked, and MAL is being relinked".
    const response = await malConnect(request());
    expect(response.status).toBe(200);
    expect(canLinkService).toHaveBeenCalledWith({}, "user-1", "mal");
  });
});
