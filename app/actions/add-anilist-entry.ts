"use server";

import { verifySession } from "@/lib/auth/dal";
import {
  addAniListOnlyEntry,
  type AddAniListEntryState,
} from "@/lib/entries/add-anilist-entry";
import { createClient } from "@/lib/supabase/server";

export type { AddAniListEntryState };

/**
 * The web's Add button for a title only AniList has. The add itself is in
 * lib/entries/add-anilist-entry.ts.
 */
export async function addAniListEntry(
  _prev: AddAniListEntryState,
  formData: FormData,
): Promise<AddAniListEntryState> {
  const { userId } = await verifySession();
  return addAniListOnlyEntry(await createClient(), userId, {
    anilistMediaId: formData.get("anilist_media_id"),
    listStatus: formData.get("list_status") || undefined,
  });
}
