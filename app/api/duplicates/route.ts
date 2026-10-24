import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userClientFromBearer } from "@/lib/auth/app-link";
import { displayTitle } from "@/lib/data/display-title";
import { getDuplicatePairs, mergeDuplicatePair } from "@/lib/data/duplicate-pairs";
import { entryCover } from "@/lib/data/entry-cover";

/**
 * Possible duplicates for the iOS app, authenticated by its Supabase access
 * token. The pairs are computed here so the app and Settings can never
 * disagree on what counts as one; dismissing is the app's own write.
 *
 * GET → `{ pairs: [{ anilist, mal }] }`, each side
 *   `{ entryId, titleId, title, cover, nsfw }`.
 * POST `{ anilistEntryId, malEntryId }` → `{ ok: true, entryId }` (the entry
 *   kept), or `{ ok: false, error }` with a 400.
 */
export async function GET(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  try {
    const pairs = await getDuplicatePairs(user.supabase);
    return Response.json({
      pairs: pairs.map(({ anilist, mal }) => ({ anilist: side(anilist), mal: side(mal) })),
    });
  } catch (cause) {
    console.error("[duplicates] failed:", cause);
    return Response.json({ error: "Your library couldn't be read." }, { status: 500 });
  }
}

const mergeSchema = z.object({
  anilistEntryId: z.coerce.number().int().positive(),
  malEntryId: z.coerce.number().int().positive(),
});

export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const parsed = mergeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Those titles couldn't be merged." }, { status: 400 });
  }

  const result = await mergeDuplicatePair(user.supabase, parsed.data);
  if (!result.ok) return Response.json(result, { status: 400 });

  revalidatePath("/library");
  revalidatePath("/settings");
  revalidatePath(`/entry/${result.entryId}`);
  return Response.json(result);
}

function side(row: Awaited<ReturnType<typeof getDuplicatePairs>>[number]["mal"]) {
  const title = row.media_titles;
  return {
    entryId: row.id,
    titleId: title.id,
    title: displayTitle(title),
    cover: entryCover(row),
    nsfw: title.nsfw,
  };
}
