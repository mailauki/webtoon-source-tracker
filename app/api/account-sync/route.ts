import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AniListAuthError, AniListRateLimitError } from "@/lib/anilist/errors";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { AccountSyncUnavailableError, syncAccounts } from "@/lib/sync/account-sync";
import {
  SYNC_DIRECTIONS,
  describeAccountSync,
  type AccountSyncEvent,
} from "@/lib/sync/plan-account-sync";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { createClient } from "@/lib/supabase/server";

// See MAL_WRITE_BUDGET_MS in lib/sync/account-sync.ts, which is sized to fit.
export const maxDuration = 60;

const bodySchema = z.object({ direction: z.enum(SYNC_DIRECTIONS) });

/**
 * Reconciles the user's MyAnimeList and AniList lists, streaming progress.
 *
 * A route handler rather than a server action because a server action answers
 * once, at the end, and a long first sync can take most of a minute. This
 * answers with newline-delimited JSON instead — `progress` lines as the run
 * moves, then one `done` or `error` line — so the settings page can draw a
 * real progress bar. See AccountSyncEvent for the line shapes.
 *
 * Server actions get a same-origin check for free and this does not, so it
 * makes the same one: a cross-site page must not be able to start a write to
 * two accounts the app does not own.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Pick which way to sync." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The page may be closed mid-run. The sync carries on regardless —
      // stopping between writes would only leave less done — so a closed
      // stream just stops being written to.
      let open = true;
      const send = (event: AccountSyncEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };

      try {
        const result = await syncAccounts(userId, parsed.data.direction, (p) =>
          send({ type: "progress", ...p }),
        );

        revalidatePath("/settings");
        if (result.toMal > 0) revalidatePath("/library");

        send({ type: "done", result, message: describeAccountSync(result) });
      } catch (cause) {
        if (cause instanceof MalAuthError || cause instanceof AniListAuthError) {
          revalidatePath("/settings");
        }
        send({ type: "error", error: errorMessage(cause) });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Keeps proxies from holding the lines back until the run ends.
      "X-Accel-Buffering": "no",
    },
  });
}

function errorMessage(cause: unknown): string {
  if (cause instanceof AccountSyncUnavailableError) return cause.message;
  if (cause instanceof MalAuthError) {
    return "Your MyAnimeList connection expired. Please reconnect.";
  }
  if (cause instanceof AniListAuthError) {
    return "Your AniList connection expired. Please reconnect.";
  }
  if (cause instanceof MalRateLimitError) {
    return "MyAnimeList is rate limiting us. Try again in a few minutes.";
  }
  if (cause instanceof AniListRateLimitError) {
    return "AniList is rate limiting us. Try again in a minute.";
  }

  console.error("[account-sync] failed:", cause);
  return (cause as Error).message;
}
