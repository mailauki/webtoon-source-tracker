import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { canonicalUrl } from "@/lib/data/canonical-url";
import { parseRanges, toMultirange } from "@/lib/data/chapter-ranges";
import type { Database } from "@/lib/supabase/types";

export type EntrySourceState = { error?: string; message?: string } | null;

/**
 * Source assignment: the actual product.
 *
 * Shared by the web's server actions (app/actions/entry-sources.ts) and the
 * iOS app's endpoints (app/api/entries/[id]/sources). Each authenticates its
 * own way and passes a Supabase client acting as that user — never the admin
 * client. This data is hand-entered and irreplaceable, so it should only ever
 * be written as the user, with RLS and the entry_sources_guard trigger both
 * standing between a bug and someone else's data. It lives outside the
 * actions file because everything a "use server" module exports becomes a
 * client-callable action.
 */

type UserClient = SupabaseClient<Database>;

/**
 * Validated first, then canonicalised — see lib/data/canonical-url.ts for why
 * the stored form matters. The order is what makes the error message the
 * user's ("Enter a valid URL") rather than something the normaliser invented:
 * it only ever sees input zod has already accepted.
 */
export const urlSchema = z
  .union([z.literal(""), z.url("Enter a valid URL (including https://).")])
  .optional()
  .transform((url) => (url ? canonicalUrl(url) : url));

/** Everything a row's editor sets, shared by add and update. */
const fieldsSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  url: urlSchema,
  chaptersRead: z
    .union([z.literal(""), z.coerce.number().int().min(0)])
    .optional(),
  // Free text ("1-40, 55, 60"), not a number: ownership is a set of ranges
  // now. Bounded here and given meaning by parseRanges, which returns the
  // message the user sees rather than a schema-shaped one.
  chaptersOwned: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  isPrimary: z.coerce.boolean().optional(),
  isOfficial: z.coerce.boolean().optional(),
  isPaid: z.coerce.boolean().optional(),
  isHiatus: z.coerce.boolean().optional(),
  isOwned: z.coerce.boolean().optional(),
});

export const addSchema = fieldsSchema.extend({
  sourceId: z.coerce.number().int().positive(),
});

export const updateSchema = fieldsSchema.extend({
  id: z.coerce.number().int().positive(),
});

export const removeSchema = z.object({
  id: z.coerce.number().int().positive(),
  entryId: z.coerce.number().int().positive(),
});

type Fields = z.infer<typeof fieldsSchema>;

/**
 * The columns an editor writes, or the user-facing reason it can't.
 *
 * Owned chapters are parsed after the schema so the user gets "Could not read
 * “4o”" rather than a type error, and so the value reaching Postgres is always
 * canonical.
 */
function toColumns(fields: Fields) {
  const owned = parseRanges(fields.chaptersOwned ?? "");
  if (!owned.ok) return { error: owned.error };

  return {
    columns: {
      url: fields.url || null,
      chapters_read:
        fields.chaptersRead === "" ? null : (fields.chaptersRead ?? null),
      // Null rather than an empty multirange: the column's check constraint
      // rejects the empty one so that "nothing owned here" has a single
      // spelling. Blank text therefore reads as "owned, not counted".
      chapters_owned: toMultirange(owned.ranges),
      notes: fields.notes || null,
      is_primary: fields.isPrimary ?? false,
      is_official: fields.isOfficial ?? true,
      is_paid: fields.isPaid ?? false,
      is_hiatus: fields.isHiatus ?? false,
      is_owned: fields.isOwned ?? false,
    },
  };
}

/**
 * Clears any other primary for this entry.
 *
 * `entry_sources_one_primary_idx` is a partial unique index, so a second
 * primary raises rather than silently winning. Demote first, then promote.
 */
async function clearOtherPrimaries(
  supabase: UserClient,
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

function revalidateEntry(entryId: number) {
  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/library");
}

export async function insertEntrySource(
  supabase: UserClient,
  input: z.infer<typeof addSchema>,
): Promise<EntrySourceState> {
  const built = toColumns(input);
  if ("error" in built) return { error: built.error };

  if (input.isPrimary) await clearOtherPrimaries(supabase, input.entryId);

  const { error } = await supabase.from("entry_sources").insert({
    // user_id is overwritten by entry_sources_guard from the entry's owner —
    // the value sent here is never trusted.
    user_id: "00000000-0000-0000-0000-000000000000",
    entry_id: input.entryId,
    source_id: input.sourceId,
    ...built.columns,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That source is already attached to this title." };
    }
    return { error: error.message };
  }

  revalidateEntry(input.entryId);
  return { message: "Source added." };
}

export async function writeEntrySource(
  supabase: UserClient,
  input: z.infer<typeof updateSchema>,
): Promise<EntrySourceState> {
  const built = toColumns(input);
  if ("error" in built) return { error: built.error };

  if (input.isPrimary) {
    await clearOtherPrimaries(supabase, input.entryId, input.id);
  }

  const { error } = await supabase
    .from("entry_sources")
    .update(built.columns)
    .eq("id", input.id)
    // The row must belong to the entry the caller names, so an edit can't
    // land on one title while demoting another's primary.
    .eq("entry_id", input.entryId);

  if (error) return { error: error.message };

  revalidateEntry(input.entryId);
  return { message: "Source updated." };
}

export async function deleteEntrySource(
  supabase: UserClient,
  { id, entryId }: z.infer<typeof removeSchema>,
): Promise<EntrySourceState> {
  const { error } = await supabase
    .from("entry_sources")
    .delete()
    .eq("id", id)
    .eq("entry_id", entryId);

  if (error) return { error: error.message };

  revalidateEntry(entryId);
  return { message: "Source removed." };
}

/**
 * The iOS app's JSON body, shaped like the web form's fields.
 *
 * JSON has a null where a form has an empty field, and the schemas read
 * "" as "cleared" — while `z.coerce.number()` would read null as 0 chapters.
 * So a null becomes "" before parsing, and anything not an object is ignored.
 */
export async function readSourceBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === null ? "" : value]),
  );
}

/** An endpoint's reply: 200 with a message, or 400 with the error. */
export function sourceReply(state: EntrySourceState): Response {
  return state?.error
    ? Response.json(state, { status: 400 })
    : Response.json(state ?? {});
}
