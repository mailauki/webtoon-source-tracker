"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type DismissDuplicateState = { ok: true } | { ok: false; error: string } | null;

const dismissSchema = z.object({
  anilistTitleId: z.coerce.number().int().positive(),
  malTitleId: z.coerce.number().int().positive(),
});

/**
 * "Not a duplicate": hides a possible duplicate from this user's list. Only
 * ever touches their own row (RLS), so unlike a merge it needs no check that
 * the pair is a real candidate.
 */
export async function dismissDuplicate(
  _prev: DismissDuplicateState,
  formData: FormData,
): Promise<DismissDuplicateState> {
  const { userId } = await verifySession();

  const parsed = dismissSchema.safeParse({
    anilistTitleId: formData.get("anilist_title_id"),
    malTitleId: formData.get("mal_title_id"),
  });
  if (!parsed.success) return { ok: false, error: "That couldn't be dismissed." };

  const supabase = await createClient();
  const { error } = await supabase.from("dismissed_duplicates").upsert(
    {
      user_id: userId,
      anilist_title_id: parsed.data.anilistTitleId,
      mal_title_id: parsed.data.malTitleId,
    },
    { onConflict: "user_id,anilist_title_id,mal_title_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[dismiss-duplicate] failed:", error.message);
    return { ok: false, error: "That couldn't be dismissed. Please try again." };
  }

  revalidatePath("/library");
  revalidatePath("/settings");
  revalidatePath("/entry/[id]", "page");
  return { ok: true };
}
