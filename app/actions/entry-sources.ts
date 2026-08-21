"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type EntrySourceState = { error?: string; message?: string } | null;

/**
 * Source assignment: the actual product.
 *
 * These use the request-scoped (RLS-enforced) client rather than the admin
 * client. This data is hand-entered and irreplaceable, so it should only ever
 * be written as the user, with RLS and the entry_sources_guard trigger both
 * standing between a bug and someone else's data.
 */

const urlSchema = z
  .union([z.literal(""), z.url("Enter a valid URL (including https://).")])
  .optional();

const addSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  sourceId: z.coerce.number().int().positive(),
  url: urlSchema,
  chaptersRead: z
    .union([z.literal(""), z.coerce.number().int().min(0)])
    .optional(),
  notes: z.string().max(2000).optional(),
  isPrimary: z.coerce.boolean().optional(),
  isOfficial: z.coerce.boolean().optional(),
  isPaid: z.coerce.boolean().optional(),
});

function readFlags(formData: FormData) {
  return {
    isPrimary: formData.get("is_primary") === "on",
    isOfficial: formData.get("is_official") === "on",
    isPaid: formData.get("is_paid") === "on",
  };
}

/**
 * Clears any other primary for this entry.
 *
 * `entry_sources_one_primary_idx` is a partial unique index, so a second
 * primary raises rather than silently winning. Demote first, then promote.
 */
async function clearOtherPrimaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entryId: number,
  exceptId?: number,
) {
  let query = supabase
    .from("entry_sources")
    .update({ is_primary: false })
    .eq("entry_id", entryId)
    .eq("is_primary", true);

  if (exceptId) query = query.neq("id", exceptId);
  await query;
}

export async function addEntrySource(
  _prev: EntrySourceState,
  formData: FormData,
): Promise<EntrySourceState> {
  await verifySession();

  const parsed = addSchema.safeParse({
    entryId: formData.get("entry_id"),
    sourceId: formData.get("source_id"),
    url: formData.get("url") ?? "",
    chaptersRead: formData.get("chapters_read") ?? "",
    notes: formData.get("notes") ?? "",
    ...readFlags(formData),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { entryId, sourceId, url, chaptersRead, notes, isPrimary, isOfficial, isPaid } =
    parsed.data;

  const supabase = await createClient();

  if (isPrimary) await clearOtherPrimaries(supabase, entryId);

  const { error } = await supabase.from("entry_sources").insert({
    // user_id is overwritten by entry_sources_guard from the entry's owner —
    // the value sent here is never trusted.
    user_id: "00000000-0000-0000-0000-000000000000",
    entry_id: entryId,
    source_id: sourceId,
    url: url || null,
    chapters_read: chaptersRead === "" ? null : (chaptersRead ?? null),
    notes: notes || null,
    is_primary: isPrimary ?? false,
    is_official: isOfficial ?? true,
    is_paid: isPaid ?? false,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That source is already attached to this title." };
    }
    return { error: error.message };
  }

  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/library");
  return { message: "Source added." };
}

export async function updateEntrySource(
  _prev: EntrySourceState,
  formData: FormData,
): Promise<EntrySourceState> {
  await verifySession();

  const parsed = z
    .object({
      id: z.coerce.number().int().positive(),
      entryId: z.coerce.number().int().positive(),
      url: urlSchema,
      chaptersRead: z
        .union([z.literal(""), z.coerce.number().int().min(0)])
        .optional(),
      notes: z.string().max(2000).optional(),
      isPrimary: z.coerce.boolean().optional(),
      isOfficial: z.coerce.boolean().optional(),
      isPaid: z.coerce.boolean().optional(),
    })
    .safeParse({
      id: formData.get("id"),
      entryId: formData.get("entry_id"),
      url: formData.get("url") ?? "",
      chaptersRead: formData.get("chapters_read") ?? "",
      notes: formData.get("notes") ?? "",
      ...readFlags(formData),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, entryId, url, chaptersRead, notes, isPrimary, isOfficial, isPaid } =
    parsed.data;

  const supabase = await createClient();

  if (isPrimary) await clearOtherPrimaries(supabase, entryId, id);

  const { error } = await supabase
    .from("entry_sources")
    .update({
      url: url || null,
      chapters_read: chaptersRead === "" ? null : (chaptersRead ?? null),
      notes: notes || null,
      is_primary: isPrimary ?? false,
      is_official: isOfficial ?? true,
      is_paid: isPaid ?? false,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/library");
  return { message: "Source updated." };
}

export async function removeEntrySource(
  _prev: EntrySourceState,
  formData: FormData,
): Promise<EntrySourceState> {
  await verifySession();

  const parsed = z
    .object({
      id: z.coerce.number().int().positive(),
      entryId: z.coerce.number().int().positive(),
    })
    .safeParse({ id: formData.get("id"), entryId: formData.get("entry_id") });

  if (!parsed.success) return { error: "Could not remove that source." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("entry_sources")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return { error: error.message };

  revalidatePath(`/entry/${parsed.data.entryId}`);
  revalidatePath("/library");
  return { message: "Source removed." };
}
