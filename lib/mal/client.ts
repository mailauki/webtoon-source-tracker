import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MalApiError, MalAuthError, MalRateLimitError } from "./errors";
import { refreshTokens } from "./oauth";
import { getTokens, saveTokens } from "./token-store";

const API_BASE = "https://api.myanimelist.net/v2";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

/**
 * In-flight refreshes, keyed by user.
 *
 * This is NOT optional. Without it, several concurrent 401s each start their
 * own refresh; MAL rotates the refresh token on every call, so the later
 * responses invalidate the earlier ones and the connection dies. Sharing one
 * promise per user means N concurrent 401s trigger exactly one refresh.
 */
const inFlightRefreshes = new Map<string, Promise<string>>();

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  /** Sent as application/x-www-form-urlencoded — MAL does not accept JSON bodies. */
  form?: Record<string, string | number | boolean | undefined>;
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function encodeForm(form: Record<string, string | number | boolean | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    if (value !== undefined) body.set(key, String(value));
  }
  return body;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A MyAnimeList API client bound to one user.
 *
 * Token freshness is handled by reacting to 401s, never by inspecting
 * `expires_at` — MAL reports the refresh window in `expires_in`, so any
 * expiry math on it is wrong (see lib/mal/oauth.ts).
 */
export class MalClient {
  constructor(private readonly userId: string) {}

  private async accessToken(): Promise<string> {
    const tokens = await getTokens(this.userId);
    if (!tokens) {
      throw new MalAuthError("No MyAnimeList connection for this account");
    }
    return tokens.access_token;
  }

  /** Refreshes, coalescing concurrent callers onto one request. */
  private async refresh(): Promise<string> {
    const existing = inFlightRefreshes.get(this.userId);
    if (existing) return existing;

    const promise = (async () => {
      const tokens = await getTokens(this.userId);
      if (!tokens) throw new MalAuthError("No MyAnimeList connection");

      let refreshed;
      try {
        refreshed = await refreshTokens(tokens.refresh_token);
      } catch (cause) {
        // The refresh token is dead (>1 month idle, or the user revoked
        // access). Flag the connection so the UI can prompt a reconnect
        // rather than showing a generic failure.
        await this.markNeedsReauth();
        throw new MalAuthError(
          `MyAnimeList refresh failed: ${(cause as Error).message}`,
        );
      }

      // Persists both tokens — MAL rotates the refresh token.
      await saveTokens(this.userId, refreshed);
      return refreshed.access_token;
    })();

    inFlightRefreshes.set(this.userId, promise);
    try {
      return await promise;
    } finally {
      inFlightRefreshes.delete(this.userId);
    }
  }

  private async markNeedsReauth(): Promise<void> {
    const admin = createAdminClient();
    await admin
      .from("mal_connections")
      .update({ status: "needs_reauth" })
      .eq("user_id", this.userId);
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let token = await this.accessToken();
    let refreshed = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(buildUrl(path, options.query), {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.form
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
        },
        body: options.form ? encodeForm(options.form) : undefined,
        // Per-user data must never enter the shared Data Cache.
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      // 401 -> refresh once, then retry the original request.
      if (response.status === 401 && !refreshed) {
        token = await this.refresh();
        refreshed = true;
        continue;
      }

      if (response.status === 401) {
        await this.markNeedsReauth();
        throw new MalAuthError("MyAnimeList rejected the refreshed token");
      }

      // MAL signals over-quota with 403, not 429. Surface it instead of
      // retrying, or we make the rate limiting worse.
      if (response.status === 403) {
        throw new MalRateLimitError();
      }

      const retryable =
        response.status === 429 || response.status >= 500;

      if (retryable && attempt < MAX_RETRIES - 1) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2 ** attempt * 500 + Math.random() * 250; // jittered
        await sleep(backoff);
        continue;
      }

      throw new MalApiError(
        `MyAnimeList request failed (${response.status}): ${await response.text()}`,
        response.status,
      );
    }

    throw new MalApiError("MyAnimeList request failed after retries", 0);
  }
}
