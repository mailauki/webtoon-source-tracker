import { userClientFromBearer } from "@/lib/auth/app-link";
import { enforceRemovalRules } from "@/lib/entries/removal-rules";

/**
 * Applies the user's removal rules now, for the iOS app, which saves and
 * deletes rules directly through Supabase (RLS scopes them) but has no other
 * way to run the removals, which reach MyAnimeList and AniList.
 *
 * Reply: `{ ok: true, removed, failed, stopped? }`.
 */
export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const result = await enforceRemovalRules(user.supabase, user.userId);
  return Response.json({ ok: true, ...result });
}
