"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import {
  removeEntryFor,
  type RemoveEntryState,
} from "@/lib/entries/remove-entry";
import { createClient } from "@/lib/supabase/server";

export type { RemoveEntryState };

/** The web's remove dialog. The removal itself is in lib/entries/remove-entry.ts. */

const removeSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  fromLibrary: z.coerce.boolean().default(false),
  fromMal: z.coerce.boolean().default(false),
  fromAniList: z.coerce.boolean().default(false),
});

export async function removeEntry(
  _prev: RemoveEntryState,
  formData: FormData,
): Promise<RemoveEntryState> {
  const { userId } = await verifySession();

  const parsed = removeSchema.safeParse({
    entryId: formData.get("entry_id"),
    // Unchecked boxes are absent from FormData entirely, so presence is the
    // value. Coercing the string "on" would be the same, but this does not
    // depend on the input's value attribute.
    fromLibrary: formData.get("from_library") !== null,
    fromMal: formData.get("from_mal") !== null,
    fromAniList: formData.get("from_anilist") !== null,
  });

  if (!parsed.success) {
    return { ok: false, error: "That title couldn't be removed." };
  }

  return removeEntryFor(await createClient(), userId, parsed.data);
}

/** Puts an archived title back on the shelf. */
export async function restoreEntry(
  _prev: RemoveEntryState,
  formData: FormData,
): Promise<RemoveEntryState> {
  const { userId } = await verifySession();

  const entryId = Number(formData.get("entry_id"));
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return { ok: false, error: "That title couldn't be restored." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_entries")
    .update({ archived_at: null })
    .eq("id", entryId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "That title couldn't be restored." };
  }

  revalidatePath("/library");
  revalidatePath("/settings");
  return { ok: true, message: "Title restored." };
}
