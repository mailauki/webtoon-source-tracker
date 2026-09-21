"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { AGE_RANGES } from "@/lib/data/age";
import { createClient } from "@/lib/supabase/server";

/**
 * Recording the user's age bracket.
 *
 * Unlike saveLibraryPrefs, this is NOT fire-and-forget. A preference that
 * fails to save costs the user a filter next visit; a confirmation that fails
 * to save leaves them looking at a form that says they are not confirmed after
 * they just confirmed, with nothing to explain it. So this one reports.
 *
 * The method is hard-coded to 'self_declared' and is deliberately not a
 * parameter. `profiles_update_own` lets a user write their own row, so if the
 * method arrived from the client, anyone could post
 * `apple_declared_age_range` and have a self-declaration recorded as a
 * verified platform signal. The platform values in the column's check
 * constraint stay unreachable from here by construction; writing one has to go
 * through a path that has actually seen an attestation. See the migration.
 *
 * Self-declaration is what a web app can honestly do. It is a statement by the
 * user, recorded with its provenance, not a verification of anything — which
 * is exactly why the provenance is stored beside it.
 */

export type AgeState = { error?: string; message?: string } | null;

const schema = z.object({
  // Validated against the known brackets, unlike the library preferences,
  // which are stored as written and resolved leniently. A bracket this version
  // does not know is not a stale preference that should degrade quietly — it
  // is the value an access decision reads, so it must be one of the four.
  ageRange: z.enum(
    AGE_RANGES.map((range) => range.value) as [string, ...string[]],
  ),
});

export async function declareAgeRange(
  _prev: AgeState,
  formData: FormData,
): Promise<AgeState> {
  const { userId } = await verifySession();

  const parsed = schema.safeParse({ ageRange: formData.get("age_range") });
  if (!parsed.success) {
    return { error: "Pick one of the listed age ranges." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      age_range: parsed.data.ageRange,
      age_assurance_method: "self_declared",
      age_assured_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    return { error: "That couldn't be saved. Try again." };
  }

  // Unlike the preference writes, this one revalidates. The settings page
  // renders the adult-content switch locked or unlocked off this value, so the
  // page has to come back changed — and every other surface it narrows is
  // server-rendered per request and will pick it up on the next visit.
  revalidatePath("/settings");

  return { message: "Saved." };
}
