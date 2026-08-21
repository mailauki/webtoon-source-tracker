"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/auth/dal";
import { deleteTokens } from "@/lib/mal/token-store";
import { createAdminClient } from "@/lib/supabase/admin";

export type MalConnectionState = { error?: string; message?: string } | null;

/**
 * Disconnects MyAnimeList.
 *
 * Deliberately keeps `user_entries` and `entry_sources`: source assignments
 * are hand-entered and irreplaceable, so the library goes read-only rather
 * than being destroyed. Reconnecting the same MAL account resumes cleanly.
 *
 * Tokens ARE deleted — there is no reason to hold credentials for a
 * connection the user just severed.
 */
export async function disconnectMal(): Promise<MalConnectionState> {
  const { userId } = await verifySession();
  const admin = createAdminClient();

  const { error } = await admin
    .from("mal_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    return { error: `Could not disconnect: ${error.message}` };
  }

  try {
    await deleteTokens(userId);
  } catch (cause) {
    return { error: `Could not clear credentials: ${(cause as Error).message}` };
  }

  revalidatePath("/settings");
  revalidatePath("/library");
  return { message: "MyAnimeList disconnected. Your sources are still saved." };
}
