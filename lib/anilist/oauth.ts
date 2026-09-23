import "server-only";

/**
 * AniList OAuth2 (authorization code grant).
 *
 * Simpler than MyAnimeList's, and different in ways worth knowing before
 * copying code between the two:
 *
 * 1. No PKCE. AniList's code grant is the classic client_secret exchange.
 * 2. The token endpoint takes JSON, where MAL's takes a form body.
 * 3. No refresh. The access token is valid for a year and AniList does not
 *    honour the refresh_token it returns, so `expires_in` here is real and
 *    worth storing — when it lapses, the user reconnects.
 *
 * The CSRF state is the same HMAC-bound value the MAL flow uses (see
 * createState in lib/mal/oauth.ts), for the same reason: it proves the
 * callback belongs to the signed-in user.
 *
 * See https://docs.anilist.co/guide/auth/authorization-code
 */

const AUTHORIZE_URL = "https://anilist.co/api/v2/oauth/authorize";
const TOKEN_URL = "https://anilist.co/api/v2/oauth/token";

export const STATE_COOKIE = "anilist_oauth_state";

export type AniListTokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("ANILIST_CLIENT_ID"),
    redirect_uri: requireEnv("ANILIST_REDIRECT_URI"),
    response_type: "code",
    state,
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchanges an authorization code for an access token. */
export async function exchangeCodeForToken(
  code: string,
): Promise<AniListTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: requireEnv("ANILIST_CLIENT_ID"),
      client_secret: requireEnv("ANILIST_CLIENT_SECRET"),
      redirect_uri: requireEnv("ANILIST_REDIRECT_URI"),
      code,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `AniList token exchange failed (${response.status}): ${await response.text()}`,
    );
  }

  return (await response.json()) as AniListTokenResponse;
}
