import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MalTokenResponse } from "./oauth";

/**
 * Reads and writes `private.mal_tokens`.
 *
 * Access goes through SECURITY DEFINER RPCs rather than the table directly:
 * PostgREST can only reach schemas in the Exposed Schemas list, and `private`
 * is deliberately excluded (a direct request returns 406 even with the secret
 * key). The RPCs are granted to service_role only, so the admin client is
 * required — anon/authenticated get "permission denied".
 */

export type StoredTokens = {
  access_token: string;
  refresh_token: string;
};

export async function getTokens(userId: string): Promise<StoredTokens | null> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("mal_tokens_get", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to read MAL tokens: ${error.message}`);
  }

  const row = data?.[0];
  return row ? { access_token: row.access_token, refresh_token: row.refresh_token } : null;
}

/**
 * Persists a token response.
 *
 * Always writes BOTH tokens: MAL rotates the refresh token on every refresh,
 * so saving only the access token leaves a stale refresh token that dies in
 * ~1 month and takes the connection with it.
 *
 * `expires_at` is recorded for diagnostics only. MAL returns the refresh
 * window (~28d) in `expires_in`, so it must never be used to decide whether
 * the access token is still valid — that is what refresh-on-401 is for.
 */
export async function saveTokens(
  userId: string,
  tokens: MalTokenResponse,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.rpc("mal_tokens_upsert", {
    p_user_id: userId,
    p_access_token: tokens.access_token,
    p_refresh_token: tokens.refresh_token,
    p_token_type: tokens.token_type ?? "Bearer",
    p_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  });

  if (error) {
    throw new Error(`Failed to store MAL tokens: ${error.message}`);
  }
}

export async function deleteTokens(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("mal_tokens_delete", { p_user_id: userId });

  if (error) {
    throw new Error(`Failed to delete MAL tokens: ${error.message}`);
  }
}
