"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { mergeDuplicatePair, type MergeDuplicateResult } from "@/lib/data/duplicate-pairs";
import { createClient } from "@/lib/supabase/server";

export type MergeDuplicateState = MergeDuplicateResult | null;

const mergeSchema = z.object({
  anilistEntryId: z.coerce.number().int().positive(),
  malEntryId: z.coerce.number().int().positive(),
});

/** Merges a possible duplicate from Settings; see mergeDuplicatePair. */
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

  const result = await mergeDuplicatePair(await createClient(), parsed.data);
  if (!result.ok) return result;

  revalidatePath("/library");
  revalidatePath("/settings");
  revalidatePath(`/entry/${result.entryId}`);
  return result;
}
