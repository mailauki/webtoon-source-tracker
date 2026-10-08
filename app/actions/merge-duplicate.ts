"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { linkAniListIds } from "@/lib/anilist/catalog";
import { verifySession } from "@/lib/auth/dal";
import { findDuplicates } from "@/lib/data/duplicates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type MergeDuplicateState =
  | { ok: true; entryId: number }
  | { ok: false; error: string }
  | null;

const mergeSchema = z.object({
  anilistEntryId: z.coerce.number().int().positive(),
  malEntryId: z.coerce.number().int().positive(),
});

/**
 * Merges an AniList-only title into the MyAnimeList title it duplicates.
 *
 * The merge itself is the catalog merge the syncs run (link_anilist_ids): it
 * records the AniList id on the MAL row and folds the AniList-only row into
 * it, for every user who holds it. That reaches past this user's library, so
 * the pair is never taken on trust: both entries are read back through the
 * user's own client, and they must still pass findDuplicates — the same rule
 * the catalog search already uses to link the two sites. A request naming
 * any other two titles is refused.
 */
export async function mergeDuplicate(
  _prev: MergeDuplicateState,
  formData: FormData,
): Promise<MergeDuplicateState> {
  await verifySession();

  const parsed = mergeSchema.safeParse({
    anilistEntryId: formData.get("anilist_entry_id"),
    malEntryId: formData.get("mal_entry_id"),
  });
  if (!parsed.success) return { ok: false, error: "Those titles couldn't be merged." };

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("user_entries")
    .select(
      "id, media_titles!inner (mal_media_id, anilist_media_id, title, title_en, alt_titles, mal_media_kind)",
    )
    .in("id", [parsed.data.anilistEntryId, parsed.data.malEntryId])
    .is("archived_at", null);

  if (error) return { ok: false, error: "Those titles couldn't be read." };

  const [pair] = findDuplicates(rows ?? []);
  if (
    !pair ||
    pair.anilist.id !== parsed.data.anilistEntryId ||
    pair.mal.id !== parsed.data.malEntryId
  ) {
    return { ok: false, error: "Those titles don't look like the same series." };
  }

  try {
    const merged = await linkAniListIds(createAdminClient(), [
      {
        malMediaId: pair.mal.media_titles.mal_media_id!,
        anilistMediaId: pair.anilist.media_titles.anilist_media_id!,
      },
    ]);
    if (merged === 0) return { ok: false, error: "Nothing was merged. Refresh and try again." };
  } catch (cause) {
    console.error("[merge-duplicate] failed:", cause);
    return { ok: false, error: "The merge failed. Please try again." };
  }

  revalidatePath("/library");
  revalidatePath("/settings");
  revalidatePath(`/entry/${pair.mal.id}`);
  return { ok: true, entryId: pair.mal.id };
}
