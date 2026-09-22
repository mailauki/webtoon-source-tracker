import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/dal", () => ({
  verifySession: async () => ({ userId: "user-1" }),
}));

import { GET as connectAniList } from "@/app/api/anilist/connect/route";
import { GET as connectMal } from "@/app/api/mal/connect/route";

/**
 * A cookie is only sent back to URLs under its Path. These flows set their
 * CSRF state (and MAL's PKCE verifier) in /connect and read them in
 * /callback, so the path has to cover the callback — the MAL one was left at
 * "/mal" when the handlers moved under /api, and every link attempt failed.
 */
function cookiePathMatches(cookiePath: string, url: string): boolean {
  const { pathname } = new URL(url);
  return (
    pathname === cookiePath ||
    pathname.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`)
  );
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  vi.stubEnv("MAL_CLIENT_ID", "mal-client");
  vi.stubEnv("MAL_REDIRECT_URI", "https://example.com/api/mal/callback");
  vi.stubEnv("ANILIST_CLIENT_ID", "anilist-client");
  vi.stubEnv("ANILIST_REDIRECT_URI", "https://example.com/api/anilist/callback");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OAuth cookie paths", () => {
  it("MAL's cookies reach its callback", async () => {
    const response = await connectMal();
    const cookies = response.cookies.getAll();

    expect(cookies.map((c) => c.name).sort()).toEqual([
      "mal_oauth_state",
      "mal_pkce_verifier",
    ]);
    for (const cookie of cookies) {
      expect(
        cookiePathMatches(cookie.path ?? "/", process.env.MAL_REDIRECT_URI!),
      ).toBe(true);
    }
  });

  it("AniList's cookie reaches its callback", async () => {
    const response = await connectAniList();
    const [cookie] = response.cookies.getAll();

    expect(cookie.name).toBe("anilist_oauth_state");
    expect(
      cookiePathMatches(cookie.path ?? "/", process.env.ANILIST_REDIRECT_URI!),
    ).toBe(true);
  });
});
