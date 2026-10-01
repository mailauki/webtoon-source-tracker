"use server";

import { verifySession } from "@/lib/auth/dal";
import { addMalEntry, type AddEntryState } from "@/lib/entries/add-entry";
import { createClient } from "@/lib/supabase/server";

export type { AddEntryState };

/** The web's Add button. The add itself is in lib/entries/add-entry.ts. */
export async function addEntry(
  _prev: AddEntryState,
  formData: FormData,
): Promise<AddEntryState> {
  const { userId } = await verifySession();
  return addMalEntry(await createClient(), userId, {
    malMediaId: formData.get("mal_media_id"),
    listStatus: formData.get("list_status") || undefined,
    anilistMediaId: formData.get("anilist_media_id") || undefined,
  });
}
