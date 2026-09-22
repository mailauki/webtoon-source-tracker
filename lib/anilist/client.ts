import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AniListApiError, AniListAuthError, AniListRateLimitError } from "./errors";
import { getToken } from "./token-store";

const API_URL = "https://graphql.anilist.co";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
/**
 * The longest Retry-After worth sleeping through inside a request. AniList's
 * window is a minute; anything longer means the quota is badly exhausted, and
 * holding a server action open that long helps nobody.
 */
const MAX_RETRY_AFTER_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GraphQLResponse<T> = {
  data?: T | null;
  errors?: { message: string; status?: number }[];
};

/**
 * One GraphQL round trip with a known token.
 *
 * Exported for the OAuth callback, which has to identify the account before
 * any token is stored. Everything else goes through AniListClient, which
 * looks the token up and flags a dead one.
 *
 * AniList reports failures both ways: an HTTP status, and an `errors` array
 * that can arrive alongside partial `data`. A response with any errors is
 * treated as failed as a whole — callers that batch several mutations into
 * one request (see saveListEntries) fall back to sending them singly.
 */
export async function anilistRequest<T>(
  token: string | null,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      // Per-user data must never enter the shared Data Cache.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
      if (attempt < MAX_RETRIES - 1 && waitMs <= MAX_RETRY_AFTER_MS) {
        await sleep(waitMs);
        continue;
      }
      throw new AniListRateLimitError();
    }

    if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
      await sleep(2 ** attempt * 500 + Math.random() * 250);
      continue;
    }

    let body: GraphQLResponse<T>;
    try {
      body = (await response.json()) as GraphQLResponse<T>;
    } catch {
      throw new AniListApiError(
        `AniList returned a non-JSON response (${response.status})`,
        response.status,
      );
    }

    const firstError = body.errors?.[0];
    // AniList answers a bad or expired token with 400 "Invalid token" as
    // often as with 401, so both are read as an auth failure.
    if (
      response.status === 401 ||
      firstError?.status === 401 ||
      /invalid token/i.test(firstError?.message ?? "")
    ) {
      throw new AniListAuthError();
    }

    if (!response.ok || firstError || !body.data) {
      throw new AniListApiError(
        `AniList request failed (${response.status}): ${firstError?.message ?? "no data"}`,
        firstError?.status ?? response.status,
      );
    }

    return body.data;
  }

  throw new AniListApiError("AniList request failed after retries", 0);
}

/**
 * An AniList GraphQL client bound to one user.
 *
 * There is no refresh dance here, unlike MalClient: AniList tokens last a year
 * and cannot be refreshed. A rejected or expired token flags the connection
 * `needs_reauth`, which is what the settings page reads to ask for a
 * reconnect.
 */
export class AniListClient {
  constructor(private readonly userId: string) {}

  private async accessToken(): Promise<string> {
    const token = await getToken(this.userId);
    if (!token) {
      throw new AniListAuthError("No AniList connection for this account");
    }
    if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
      await this.markNeedsReauth();
      throw new AniListAuthError();
    }
    return token.access_token;
  }

  private async markNeedsReauth(): Promise<void> {
    const admin = createAdminClient();
    await admin
      .from("anilist_connections")
      .update({ status: "needs_reauth" })
      .eq("user_id", this.userId);
  }

  async request<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const token = await this.accessToken();
    try {
      return await anilistRequest<T>(token, query, variables);
    } catch (cause) {
      if (cause instanceof AniListAuthError) await this.markNeedsReauth();
      throw cause;
    }
  }
}
