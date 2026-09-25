import { userClientFromBearer } from "@/lib/auth/app-link";
import { patchSchema, saveProgress } from "@/lib/progress/save-progress";

/**
 * Progress edits from the iOS app: the same save as the web's progress form
 * (MyAnimeList first, then the local copy, then AniList), authenticated by
 * the app's Supabase access token instead of a session cookie.
 *
 * Body: `{ numChaptersRead?, listStatus?, score? }`, any subset.
 * Reply: `{ ok: true, message }`, or `{ ok: false, error }` with a 4xx.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/entries/[id]/progress">,
) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse({
    ...(typeof body === "object" && body !== null ? body : {}),
    // From the path, and spread last, so the body cannot redirect the edit.
    entryId: (await params).id,
  });
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const state = await saveProgress(user.supabase, user.userId, parsed.data);
  if (!state?.ok) {
    return Response.json(state ?? { ok: false, error: "Nothing to update." }, { status: 400 });
  }
  return Response.json(state);
}
