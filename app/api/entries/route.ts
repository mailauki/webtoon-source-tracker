import { userClientFromBearer } from "@/lib/auth/app-link";
import { addAniListOnlyEntry } from "@/lib/entries/add-anilist-entry";
import { addMalEntry } from "@/lib/entries/add-entry";

/**
 * Adds a catalog title from the iOS app's Search and Discover pages: the same
 * add as the web's Add button, authenticated by the app's Supabase access
 * token. A title with a MAL id goes through MyAnimeList; one without goes
 * through AniList, as the web button decides.
 *
 * Body: `{ malMediaId?, anilistMediaId?, listStatus? }`.
 * Reply: `{ ok: true, message, entryId }`, or `{ ok: false, error }` with a 4xx.
 */
export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const input = typeof body === "object" && body !== null ? body : {};

  const state =
    input.malMediaId != null
      ? await addMalEntry(user.supabase, user.userId, input)
      : await addAniListOnlyEntry(user.supabase, user.userId, input);

  if (!state?.ok) {
    return Response.json(state ?? { ok: false, error: "That title couldn't be added." }, { status: 400 });
  }
  return Response.json(state);
}
