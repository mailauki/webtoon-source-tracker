import { z } from "zod";

import { userClientFromBearer } from "@/lib/auth/app-link";
import { removeEntryFor } from "@/lib/entries/remove-entry";

const bodySchema = z.object({
  entryId: z.coerce.number().int().positive(),
  fromLibrary: z.boolean().default(false),
  fromMal: z.boolean().default(false),
  fromAniList: z.boolean().default(false),
});

/**
 * Removals from the iOS app: the same removal as the web's dialog (remote
 * lists first, then the archive), authenticated by the app's Supabase access
 * token instead of a session cookie.
 *
 * Body: `{ fromLibrary?, fromMal?, fromAniList? }`, at least one true.
 * Reply: `{ ok: true, message }`, or `{ ok: false, error }` with a 4xx — 401
 * when a site's login has expired and 429 when it is rate limiting, so a
 * batch can stop rather than fail the same way on every remaining title.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/entries/[id]/remove">,
) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse({
    ...(typeof body === "object" && body !== null ? body : {}),
    // From the path, and spread last, so the body cannot redirect the removal.
    entryId: (await params).id,
  });
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const state = await removeEntryFor(user.supabase, user.userId, parsed.data);
  if (!state?.ok) {
    const status = state?.needsReauth ? 401 : state?.rateLimited ? 429 : 400;
    return Response.json(state ?? { ok: false, error: "Nothing to remove." }, { status });
  }
  return Response.json(state);
}
