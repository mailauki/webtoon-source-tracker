"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AniListAuthError, AniListRateLimitError } from "@/lib/anilist/errors";
import { verifySession } from "@/lib/auth/dal";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { AccountSyncUnavailableError, syncAccounts } from "@/lib/sync/account-sync";
import {
  SYNC_DIRECTIONS,
  describeAccountSync,
  type AccountSyncResult,
} from "@/lib/sync/plan-account-sync";

export type AccountSyncState =
  | { ok: true; result: AccountSyncResult; message: string }
  | { ok: false; error: string }
  | null;

const directionSchema = z.enum(SYNC_DIRECTIONS);

/**
 * Reconciles the user's MyAnimeList and AniList lists.
 *
 * A server action for the same reasons runSync is one: user-initiated, needs
 * revalidatePath, and gets CSRF protection for free.
 */
export async function runAccountSync(
  _prev: AccountSyncState,
  formData: FormData,
): Promise<AccountSyncState> {
  // Server actions are independently reachable endpoints — this is required.
  const { userId } = await verifySession();

  const parsed = directionSchema.safeParse(formData.get("direction"));
  if (!parsed.success) {
    return { ok: false, error: "Pick which way to sync." };
  }

  try {
    const result = await syncAccounts(userId, parsed.data);

    revalidatePath("/settings");
    if (result.toMal > 0) revalidatePath("/library");

    return { ok: true, result, message: describeAccountSync(result) };
  } catch (cause) {
    if (cause instanceof AccountSyncUnavailableError) {
      return { ok: false, error: cause.message };
    }
    if (cause instanceof MalAuthError) {
      revalidatePath("/settings");
      return { ok: false, error: "Your MyAnimeList connection expired. Please reconnect." };
    }
    if (cause instanceof AniListAuthError) {
      revalidatePath("/settings");
      return { ok: false, error: "Your AniList connection expired. Please reconnect." };
    }
    if (cause instanceof MalRateLimitError) {
      return { ok: false, error: "MyAnimeList is rate limiting us. Try again in a few minutes." };
    }
    if (cause instanceof AniListRateLimitError) {
      return { ok: false, error: "AniList is rate limiting us. Try again in a minute." };
    }

    console.error("[account-sync] failed:", cause);
    return { ok: false, error: (cause as Error).message };
  }
}
