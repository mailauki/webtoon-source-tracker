import { revalidatePath } from "next/cache";

import { userClientFromBearer } from "@/lib/auth/app-link";
import { disconnectProvider } from "@/lib/sync/disconnect";

/**
 * Disconnecting MyAnimeList from the iOS app: the same as the Settings button,
 * authenticated by the app's Supabase access token instead of a session
 * cookie. Reply: `{ message }`, or `{ error }` with a 4xx/5xx.
 */
export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const result = await disconnectProvider("mal", user.userId);
  if (result.error) return Response.json(result, { status: 500 });

  revalidatePath("/settings");
  revalidatePath("/library");
  return Response.json(result);
}
