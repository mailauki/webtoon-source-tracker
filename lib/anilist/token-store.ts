import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AniListTokenResponse } from "./oauth";

/**
 * Reads and writes `private.anilist_tokens`, through service-role-only RPCs —
 * the same arrangement as lib/mal/token-store.ts, for the same reasons.
 */

export type StoredAniListToken = {
  access_token: string;
  expires_at: string | null;
};

export async function getToken(
  userId: string,
): Promise<StoredAniListToken | null> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("anilist_tokens_get", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to read AniList token: ${error.message}`);
  }

  const row = data?.[0];
  return row ? { access_token: row.access_token, expires_at: row.expires_at } : null;
}

/**
 * Persists a token response.
 *
 * `expires_at` is meaningful here, unlike MAL's: AniList reports the access
 * token's own lifetime (a year), and there is no refresh to fall back on.
 */
export async function saveToken(
  userId: string,
  token: AniListTokenResponse,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.rpc("anilist_tokens_upsert", {
    p_user_id: userId,
    p_access_token: token.access_token,
    p_token_type: token.token_type ?? "Bearer",
    p_expires_at: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined,
  });

  if (error) {
    throw new Error(`Failed to store AniList token: ${error.message}`);
  }
}

export async function deleteToken(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("anilist_tokens_delete", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to delete AniList token: ${error.message}`);
  }
}
