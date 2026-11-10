"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/auth/dal";
import { disconnectProvider } from "@/lib/sync/disconnect";

export type MalConnectionState = { error?: string; message?: string } | null;

/** Disconnects MyAnimeList; see disconnectProvider. */
export async function disconnectMal(): Promise<MalConnectionState> {
  const { userId } = await verifySession();
  const result = await disconnectProvider("mal", userId);
  if (!result.error) {
    revalidatePath("/settings");
    revalidatePath("/library");
  }
  return result;
}
