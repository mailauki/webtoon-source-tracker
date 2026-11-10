import "server-only";

import { deleteToken } from "@/lib/anilist/token-store";
import { deleteTokens } from "@/lib/mal/token-store";
import { createAdminClient } from "@/lib/supabase/admin";

export type DisconnectResult = { error?: string; message?: string };

/**
 * Disconnects MyAnimeList or AniList, for Settings and the iOS app alike.
 *
 * Deliberately keeps `user_entries` and `entry_sources`: source assignments
 * are hand-entered and irreplaceable, so the library goes read-only rather
 * than being destroyed, and reconnecting the same account resumes cleanly.
 * Nothing on either site is touched.
 *
 * Tokens ARE deleted — there is no reason to hold credentials for a
 * connection the user just severed.
 */
export async function disconnectProvider(
  provider: "mal" | "anilist",
  userId: string,
): Promise<DisconnectResult> {
  const admin = createAdminClient();

  const { error } = await admin
    .from(provider === "mal" ? "mal_connections" : "anilist_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    return { error: `Could not disconnect: ${error.message}` };
  }

  try {
    await (provider === "mal" ? deleteTokens(userId) : deleteToken(userId));
  } catch (cause) {
    return { error: `Could not clear credentials: ${(cause as Error).message}` };
  }

  return {
    message:
      provider === "mal"
        ? "MyAnimeList disconnected. Your sources are still saved."
        : "AniList disconnected.",
  };
}
