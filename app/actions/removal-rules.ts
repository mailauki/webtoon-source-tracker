"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { enforceRemovalRules } from "@/lib/entries/removal-rules";
import { MAL_LIST_STATUSES } from "@/lib/mal/types";
import { createClient } from "@/lib/supabase/server";

export type RemovalRuleState = { error?: string; message?: string } | null;

const ruleSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("status"), value: z.enum(MAL_LIST_STATUSES) }),
    z.object({ kind: z.literal("source"), value: z.coerce.number().int().positive() }),
    z.object({ kind: z.literal("genre"), value: z.coerce.number().int().positive() }),
  ])
  .and(
    z.object({
      fromLibrary: z.boolean(),
      fromMal: z.boolean(),
      fromAniList: z.boolean(),
    }),
  );

/**
 * Saves a removal rule and applies it straight away. Later matches are
 * handled by the sync and the edits that call enforceRemovalRules.
 */
export async function createRemovalRule(
  _prev: RemovalRuleState,
  formData: FormData,
): Promise<RemovalRuleState> {
  const { userId } = await verifySession();

  const parsed = ruleSchema.safeParse({
    kind: formData.get("kind"),
    value: formData.get("value"),
    fromLibrary: formData.get("from_library") !== null,
    fromMal: formData.get("from_mal") !== null,
    fromAniList: formData.get("from_anilist") !== null,
  });
  if (!parsed.success) return { error: "Choose what to remove and where from." };

  const { kind, value, fromLibrary, fromMal, fromAniList } = parsed.data;
  if (!fromLibrary && !fromMal && !fromAniList) {
    return { error: "Choose where to remove matching titles from." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("removal_rules").insert({
    user_id: userId,
    kind,
    value: String(value),
    from_library: fromLibrary,
    from_mal: fromMal,
    from_anilist: fromAniList,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "You already have a rule for that."
          : "That rule couldn't be saved.",
    };
  }

  const result = await enforceRemovalRules(supabase, userId);
  revalidatePath("/settings");
  revalidatePath("/library");
  return {
    message: result.stopped
      ? `Rule saved. ${result.removed} removed so far — ${result.stopped}`
      : `Rule saved. ${result.removed} ${result.removed === 1 ? "title" : "titles"} removed.`,
  };
}

/** Stops a rule applying to future titles. What it removed stays removed. */
export async function deleteRemovalRule(
  _prev: RemovalRuleState,
  formData: FormData,
): Promise<RemovalRuleState> {
  await verifySession();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Unknown rule." };

  const supabase = await createClient();
  const { error } = await supabase.from("removal_rules").delete().eq("id", id);
  if (error) return { error: "That rule couldn't be deleted." };

  revalidatePath("/settings");
  return { message: "Rule deleted." };
}
