"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/auth/dal";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { syncMalList, type SyncResult } from "@/lib/sync/sync-list";

export type SyncState =
  | { ok: true; result: SyncResult; message: string }
  | { ok: false; error: string; needsReauth?: boolean }
  | null;

/**
 * Triggers a sync for the signed-in user.
 *
 * A server action rather than a route handler: it is user-initiated, needs
 * revalidatePath, and gets CSRF protection for free. The engine itself lives
 * in lib/sync/sync-list.ts so a scheduled job could reuse it later.
 */
export async function runSync(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  // Server actions are independently reachable endpoints — this is required.
  const { userId } = await verifySession();

  const force = formData.get("force") === "1";

  try {
    const result = await syncMalList(userId, { force });

    revalidatePath("/library");
    revalidatePath("/settings");

    if (result.skipped) {
      return {
        ok: true,
        result,
        message: "Already up to date.",
      };
    }

    const parts = [`${result.entries} titles synced`];
    if (result.removed > 0) parts.push(`${result.removed} removed`);

    return { ok: true, result, message: parts.join(", ") + "." };
  } catch (cause) {
    if (cause instanceof MalAuthError) {
      revalidatePath("/library");
      return {
        ok: false,
        needsReauth: true,
        error: "Your MyAnimeList connection expired. Please reconnect.",
      };
    }

    if (cause instanceof MalRateLimitError) {
      return {
        ok: false,
        error: "MyAnimeList is rate limiting us. Try again in a few minutes.",
      };
    }

    return { ok: false, error: (cause as Error).message };
  }
}
