"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import {
  addSchema,
  deleteEntrySource,
  insertEntrySource,
  removeSchema,
  updateSchema,
  urlSchema,
  writeEntrySource,
  type EntrySourceState,
} from "@/lib/sources/entry-sources";
import { createClient } from "@/lib/supabase/server";

export type { EntrySourceState };

/*
 * The web's source forms. Validation and writes live in
 * lib/sources/entry-sources.ts, shared with the iOS app's endpoints.
 */

function readFields(formData: FormData) {
  return {
    entryId: formData.get("entry_id"),
    url: formData.get("url") ?? "",
    chaptersRead: formData.get("chapters_read") ?? "",
    chaptersOwned: formData.get("chapters_owned") ?? "",
    notes: formData.get("notes") ?? "",
    isPrimary: formData.get("is_primary") === "on",
    isOfficial: formData.get("is_official") === "on",
    isPaid: formData.get("is_paid") === "on",
    isHiatus: formData.get("is_hiatus") === "on",
    isOwned: formData.get("is_owned") === "on",
  };
}

export async function addEntrySource(
  _prev: EntrySourceState,
  formData: FormData,
): Promise<EntrySourceState> {
  await verifySession();

  const parsed = addSchema.safeParse({
    ...readFields(formData),
    sourceId: formData.get("source_id"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return insertEntrySource(await createClient(), parsed.data);
}

export async function updateEntrySource(
  _prev: EntrySourceState,
  formData: FormData,
): Promise<EntrySourceState> {
  await verifySession();

  const parsed = updateSchema.safeParse({
    ...readFields(formData),
    id: formData.get("id"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return writeEntrySource(await createClient(), parsed.data);
}

export async function removeEntrySource(
  _prev: EntrySourceState,
  formData: FormData,
): Promise<EntrySourceState> {
  await verifySession();

  const parsed = removeSchema.safeParse({
    id: formData.get("id"),
    entryId: formData.get("entry_id"),
  });
  if (!parsed.success) return { error: "Could not remove that source." };

  return deleteEntrySource(await createClient(), parsed.data);
}

/**
 * Sets only the URL of an attached source.
 *
 * Separate from updateEntrySource, which writes every field from the form and
 * would reset the flags and counts of a row this only means to give a link.
 * Used by the AniList link import.
 */
export async function setEntrySourceUrl(
  _prev: EntrySourceState,
  formData: FormData,
): Promise<EntrySourceState> {
  await verifySession();

  const parsed = z
    .object({
      id: z.coerce.number().int().positive(),
      entryId: z.coerce.number().int().positive(),
      url: urlSchema,
    })
    .safeParse({
      id: formData.get("id"),
      entryId: formData.get("entry_id"),
      url: formData.get("url") ?? "",
    });

  if (!parsed.success || !parsed.data.url) {
    return { error: parsed.error?.issues[0].message ?? "No link to save." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("entry_sources")
    .update({ url: parsed.data.url })
    .eq("id", parsed.data.id);

  if (error) return { error: error.message };

  revalidatePath(`/entry/${parsed.data.entryId}`);
  revalidatePath("/library");
  return { message: "Link saved." };
}
