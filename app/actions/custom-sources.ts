"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type CustomSourceState =
  | { error?: string; message?: string; sourceId?: number }
  | null;

/**
 * Per-user custom sources.
 *
 * A custom source is a `sources` row with owner_id set and parent_slug='other',
 * so it rolls up under "Other" in any cross-user aggregate while showing its
 * own name to its owner. The sources_shape_ck constraint makes the two shapes
 * mutually exclusive, so a custom row can never masquerade as a global one.
 */

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the source a name.")
  .max(60, "Keep the name under 60 characters.");

export async function createCustomSource(
  _prev: CustomSourceState,
  formData: FormData,
): Promise<CustomSourceState> {
  const { userId } = await verifySession();

  const parsed = z
    .object({
      name: nameSchema,
      baseUrl: z
        .union([z.literal(""), z.url("Enter a valid URL (including https://).")])
        .optional(),
    })
    .safeParse({
      name: formData.get("name"),
      baseUrl: formData.get("base_url") ?? "",
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sources")
    .insert({
      owner_id: userId,
      parent_slug: "other",
      slug: null,
      name: parsed.data.name,
      base_url: parsed.data.baseUrl || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have a source with that name." };
    }
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/library");
  return { message: `Added “${parsed.data.name}”.`, sourceId: data.id };
}

export async function renameCustomSource(
  _prev: CustomSourceState,
  formData: FormData,
): Promise<CustomSourceState> {
  await verifySession();

  const parsed = z
    .object({ id: z.coerce.number().int().positive(), name: nameSchema })
    .safeParse({ id: formData.get("id"), name: formData.get("name") });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  // RLS restricts this to rows the user owns, so a global source cannot be
  // renamed even if an id is guessed.
  const { error } = await supabase
    .from("sources")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have a source with that name." };
    }
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/library");
  return { message: "Source renamed." };
}

export async function deleteCustomSource(
  _prev: CustomSourceState,
  formData: FormData,
): Promise<CustomSourceState> {
  await verifySession();

  const parsed = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(formData.get("id"));

  if (!parsed.success) return { error: "Could not delete that source." };

  const supabase = await createClient();

  // entry_sources.source_id is `on delete restrict`, so a raw delete would
  // surface a bare FK error. Count first and explain instead.
  const { count } = await supabase
    .from("entry_sources")
    .select("id", { count: "exact", head: true })
    .eq("source_id", parsed.data);

  if ((count ?? 0) > 0) {
    return {
      error: `That source is used by ${count} ${
        count === 1 ? "title" : "titles"
      }. Remove it from those first.`,
    };
  }

  const { error } = await supabase
    .from("sources")
    .delete()
    .eq("id", parsed.data);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/library");
  return { message: "Source deleted." };
}
