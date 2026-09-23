"use server";

import { revalidatePath } from "next/cache";

import { deleteToken } from "@/lib/anilist/token-store";
import { verifySession } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

export type AniListConnectionState = { error?: string; message?: string } | null;

/**
 * Disconnects AniList.
 *
 * Nothing local is removed — the library mirrors MyAnimeList, not AniList —
 * and nothing on AniList is touched. The token is deleted: there is no reason
 * to hold a credential for a connection the user just severed.
 */
export async function disconnectAniList(): Promise<AniListConnectionState> {
  const { userId } = await verifySession();
  const admin = createAdminClient();

  const { error } = await admin
    .from("anilist_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    return { error: `Could not disconnect: ${error.message}` };
  }

  try {
    await deleteToken(userId);
  } catch (cause) {
    return { error: `Could not clear credentials: ${(cause as Error).message}` };
  }

  revalidatePath("/settings");
  return { message: "AniList disconnected." };
}
