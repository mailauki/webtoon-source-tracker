import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getClaims, verifySession, exchangeCodeForTokens, exchangeCodeForToken } = vi.hoisted(() => ({
  // Bearer tokens in these tests are just user ids.
  getClaims: vi.fn(async (token: string) => ({ data: { claims: { sub: token } }, error: null })),
  verifySession: vi.fn(async () => {
    throw new Error("the app flow must not read the browser session");
  }),
  exchangeCodeForTokens: vi.fn(async () => {
    throw new Error("stop after the exchange");
  }),
  exchangeCodeForToken: vi.fn(async () => {
    throw new Error("stop after the exchange");
  }),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getClaims } }) }));
vi.mock("@/lib/auth/dal", () => ({ verifySession }));
vi.mock("@/lib/mal/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mal/oauth")>()),
  exchangeCodeForTokens,
}));
vi.mock("@/lib/anilist/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/anilist/oauth")>()),
  exchangeCodeForToken,
}));

import { POST as anilistCallbackPost } from "@/app/api/anilist/callback/route";
import { GET as malCallbackGet, POST as malCallbackPost } from "@/app/api/mal/callback/route";
import { POST as malConnectPost } from "@/app/api/mal/connect/route";
import { appCodeVerifier, createAppState, verifyAppState } from "@/lib/auth/app-link";

const VICTIM = "user-victim";
const ATTACKER = "user-attacker";

function post(url: string, bearer: string | null, body?: unknown) {
  return new NextRequest(`https://example.com${url}`, {
    method: "POST",
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  vi.stubEnv("MAL_CLIENT_ID", "mal-client");
  vi.stubEnv("MAL_REDIRECT_URI", "https://example.com/api/mal/callback");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("app states", () => {
  it("are bound to the user they were issued for", () => {
    const state = createAppState(VICTIM);
    expect(verifyAppState(state, VICTIM)).toBe(true);
    expect(verifyAppState(state, ATTACKER)).toBe(false);
  });

  it("are not interchangeable with web states", () => {
    const state = createAppState(VICTIM);
    expect(verifyAppState(state.slice("app.".length), VICTIM)).toBe(false);
  });

  it("derive a stable PKCE verifier MAL accepts", () => {
    const state = createAppState(VICTIM);
    expect(appCodeVerifier(state)).toBe(appCodeVerifier(state));
    expect(appCodeVerifier(state)).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(appCodeVerifier(createAppState(VICTIM))).not.toBe(appCodeVerifier(state));
  });
});

describe("MAL app link", () => {
  it("leg 1 needs a signed-in app", async () => {
    expect((await malConnectPost(post("/api/mal/connect", null))).status).toBe(401);

    const response = await malConnectPost(post("/api/mal/connect", VICTIM));
    const authorize = new URL((await response.json()).url);
    const state = authorize.searchParams.get("state")!;

    expect(verifyAppState(state, VICTIM)).toBe(true);
    expect(authorize.searchParams.get("code_challenge")).toBe(appCodeVerifier(state));
  });

  it("leg 2 forwards to the app without completing anything", async () => {
    const state = createAppState(VICTIM);
    const response = await malCallbackGet(
      new NextRequest(`https://example.com/api/mal/callback?code=c&state=${state}`),
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.protocol).toBe("webtoonsourcetracker:");
    expect(location.searchParams.get("code")).toBe("c");
    expect(verifySession).not.toHaveBeenCalled();
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("leg 3 refuses a code carrying someone else's state", async () => {
    // The attack: the attacker's state, the victim's authorization and app.
    const response = await malCallbackPost(
      post("/api/mal/callback", VICTIM, { code: "c", state: createAppState(ATTACKER) }),
    );

    expect(response.status).toBe(403);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("leg 3 refuses a request with no token or a web state", async () => {
    const state = createAppState(VICTIM);
    expect((await malCallbackPost(post("/api/mal/callback", null, { code: "c", state }))).status).toBe(401);
    expect(
      (await malCallbackPost(
        post("/api/mal/callback", VICTIM, { code: "c", state: state.slice("app.".length) }),
      )).status,
    ).toBe(403);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("leg 3 exchanges with the derived verifier for the matching user", async () => {
    const state = createAppState(VICTIM);
    const response = await malCallbackPost(post("/api/mal/callback", VICTIM, { code: "c", state }));

    expect(exchangeCodeForTokens).toHaveBeenCalledWith("c", appCodeVerifier(state));
    expect((await response.json()).error).toMatch(/stop after the exchange/);
  });
});

describe("AniList app link", () => {
  it("leg 3 refuses a code carrying someone else's state", async () => {
    const response = await anilistCallbackPost(
      post("/api/anilist/callback", VICTIM, { code: "c", state: createAppState(ATTACKER) }),
    );

    expect(response.status).toBe(403);
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("leg 3 exchanges for the matching user", async () => {
    const state = createAppState(VICTIM);
    await anilistCallbackPost(post("/api/anilist/callback", VICTIM, { code: "c", state }));

    expect(exchangeCodeForToken).toHaveBeenCalledWith("c");
  });
});
