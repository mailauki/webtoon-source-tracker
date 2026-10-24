"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/auth/dal";
import { disconnectProvider } from "@/lib/sync/disconnect";

export type AniListConnectionState = { error?: string; message?: string } | null;

/** Disconnects AniList; see disconnectProvider. */
export async function disconnectAniList(): Promise<AniListConnectionState> {
  const { userId } = await verifySession();
  const result = await disconnectProvider("anilist", userId);
  if (!result.error) revalidatePath("/settings");
  return result;
}
