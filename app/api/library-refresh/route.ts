import { revalidatePath } from "next/cache";

import { isSameOrigin } from "@/lib/auth/same-origin";
import { refreshLibrary, type RefreshEvent } from "@/lib/sync/refresh-library";
import { createClient } from "@/lib/supabase/server";

// No maxDuration, deliberately: this ran as a server action on /library with
// the platform default, and a first refresh of a long list can need it.
// The account sync sets 60 because its write budget is sized to that.

/**
 * Refresh library, streaming progress.
 *
 * Was a server action, which answers once at the end — so the button could
 * only spin. This answers with newline-delimited JSON instead, the same shape
 * as /api/account-sync: `progress` lines as the run moves, then one `done` or
 * `error` line. See RefreshEvent.
 *
 * A press always refreshes now, past the staleness gate: the button is the
 * only caller, and pressing it is the user saying "now".
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A closed tab does not stop the refresh — half a refresh is no better
      // than a whole one — so a closed stream just stops being written to.
      let open = true;
      const send = (event: RefreshEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };

      try {
        const result = await refreshLibrary(userId, {
          force: true,
          onProgress: (step, value) => send({ type: "progress", step, value }),
        });

        if (result.ok) {
          send({ type: "done", message: result.message });
        } else {
          send({
            type: "error",
            error: result.error,
            needsReauth: result.needsReauth,
          });
        }
      } catch (cause) {
        console.error("[library-refresh] failed:", cause);
        send({ type: "error", error: (cause as Error).message });
      } finally {
        // Whatever happened, the shelf and the connection notices may have
        // changed: a pull that half ran, or a connection that expired.
        revalidatePath("/library");
        revalidatePath("/settings");
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
