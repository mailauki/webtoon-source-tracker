import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * MyAnimeList OAuth2.
 *
 * Two things about MAL's implementation are unusual enough to call out, since
 * both look like bugs to anyone reading this cold:
 *
 * 1. PKCE `plain` ONLY. MAL does not support S256, so the code_challenge is
 *    the code_verifier verbatim. Do NOT "fix" this to S256 — login breaks.
 *    See https://myanimelist.net/apiconfig/references/authorization
 *
 * 2. `expires_in` in the token response is ~2415600 (28 days), which is the
 *    REFRESH token's window, not the access token's — despite MAL's prose
 *    saying "one hour". Never compute access-token expiry from it. The real
 *    mechanism is refresh-on-401 (see lib/mal/client.ts).
 */

const AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize";
const TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";

export const PKCE_COOKIE = "mal_pkce_verifier";
export const STATE_COOKIE = "mal_oauth_state";

export type MalTokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Generates a PKCE code verifier.
 *
 * MAL requires 43–128 characters. 64 random bytes as base64url yields 86,
 * comfortably inside that range.
 */
export function createCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

/**
 * Builds an opaque state value bound to the signed-in user.
 *
 * Binding matters: without it, an attacker could complete a MAL authorization
 * in their own browser and replay the callback against a different logged-in
 * account, linking their MAL to someone else's profile. The HMAC lets the
 * callback prove the state was issued for *this* user.
 */
export function createState(userId: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const signature = createHmac("sha256", requireEnv("SUPABASE_SECRET_KEY"))
    .update(`${userId}:${nonce}`)
    .digest("base64url");
  return `${nonce}.${signature}`;
}

/** Constant-time verification of a state value against the current user. */
export function verifyState(state: string, userId: string): boolean {
  const [nonce, signature] = state.split(".");
  if (!nonce || !signature) return false;

  const expected = createHmac("sha256", requireEnv("SUPABASE_SECRET_KEY"))
    .update(`${userId}:${nonce}`)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so check that first.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildAuthorizeUrl(codeVerifier: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("MAL_CLIENT_ID"),
    // plain PKCE: challenge === verifier. Not a mistake — see the note above.
    code_challenge: codeVerifier,
    code_challenge_method: "plain",
    state,
    redirect_uri: requireEnv("MAL_REDIRECT_URI"),
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchanges an authorization code for tokens. */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<MalTokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("MAL_CLIENT_ID"),
    client_secret: requireEnv("MAL_CLIENT_SECRET"),
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: requireEnv("MAL_REDIRECT_URI"),
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `MAL token exchange failed (${response.status}): ${await response.text()}`,
    );
  }

  return (await response.json()) as MalTokenResponse;
}

/**
 * Refreshes an access token.
 *
 * MAL ROTATES the refresh token on every refresh. The caller must persist the
 * new refresh_token as well — dropping it silently bricks the connection about
 * a month later, when the old one expires.
 */
export async function refreshTokens(
  refreshToken: string,
): Promise<MalTokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("MAL_CLIENT_ID"),
    client_secret: requireEnv("MAL_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `MAL token refresh failed (${response.status}): ${await response.text()}`,
    );
  }

  return (await response.json()) as MalTokenResponse;
}
