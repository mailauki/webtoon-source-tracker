"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * A user's own collections.
 *
 * A user collection is a `collections` row with owner_id set and slug null —
 * collections_shape_ck makes the two shapes mutually exclusive, so one of
 * these can never masquerade as a curated row by claiming a slug, and the
 * curated rows can never be written here (the insert policy requires
 * `owner_id = auth.uid()`, and null never equals a uuid).
 *
 * Every write below relies on RLS to scope rows to the caller rather than
 * filtering by owner_id in the statement: `collections_update_own` and its
 * siblings already carry both `using` and `with check`, so a guessed id
 * matches nothing rather than touching someone else's row. Item writes lean on
 * `private.collection_items_guard()` on top of that, which re-derives owner_id
 * from the parent collection — so inserting into a collection you do not own
 * fails the policy even if you post your own id alongside it.
 */

export type CollectionState =
  | { ok: true; message: string; collectionId?: number }
  | { ok: false; error: string }
  | null;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the collection a name.")
  .max(80, "Keep the name under 80 characters.");

const descriptionSchema = z
  .string()
  .trim()
  .max(200, "Keep the description under 200 characters.")
  .optional();

const idSchema = z.coerce.number().int().positive();

/** Postgres unique_violation — the (owner_id, name) constraint. */
const UNIQUE_VIOLATION = "23505";

export async function createCollection(
  _prev: CollectionState,
  formData: FormData,
): Promise<CollectionState> {
  const { userId } = await verifySession();

  const parsed = z
    .object({ name: nameSchema, description: descriptionSchema })
    .safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
    });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .insert({
      owner_id: userId,
      // Explicitly null, not omitted: this is the half of collections_shape_ck
      // that marks the row as a user collection rather than a curated one.
      slug: null,
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "You already have a collection with that name." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/collections");
  return {
    ok: true,
    message: `Created “${parsed.data.name}”.`,
    collectionId: data.id,
  };
}

export async function updateCollection(
  _prev: CollectionState,
  formData: FormData,
): Promise<CollectionState> {
  await verifySession();

  const parsed = z
    .object({
      id: idSchema,
      name: nameSchema,
      description: descriptionSchema,
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      description: formData.get("description") ?? "",
    });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("collections")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("id", parsed.data.id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "You already have a collection with that name." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/collections");
  revalidatePath(`/collections/mine/${parsed.data.id}`);
  return { ok: true, message: "Collection updated." };
}

export async function deleteCollection(
  _prev: CollectionState,
  formData: FormData,
): Promise<CollectionState> {
  await verifySession();

  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { ok: false, error: "Could not delete that collection." };

  const supabase = await createClient();

  // collection_items.collection_id is `on delete cascade`, so the items go
  // with it. Unlike a custom source there is nothing to warn about first: a
  // collection holds references, never the hand-entered URLs and notes that
  // make deleting a source unrecoverable.
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", parsed.data);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/collections");
  return { ok: true, message: "Collection deleted." };
}

/**
 * Puts a title into a collection.
 *
 * Takes the catalog `title_id`, not a user_entries id: collection_items points
 * at media_titles so a collection survives a title leaving the library (see
 * the migration). The library card that calls this has the catalog id to hand.
 *
 * The new item goes last. `position` is read rather than computed in SQL
 * because PostgREST has no expression assignment — a race between two adds
 * could hand out the same position, which is exactly why the column is not
 * unique and why hydrateCollection breaks ties on id.
 */
export async function addToCollection(
  _prev: CollectionState,
  formData: FormData,
): Promise<CollectionState> {
  await verifySession();

  const parsed = z
    .object({ collectionId: idSchema, titleId: idSchema })
    .safeParse({
      collectionId: formData.get("collection_id"),
      titleId: formData.get("title_id"),
    });

  if (!parsed.success) return { ok: false, error: "Could not add that title." };

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("collection_items")
    .select("position")
    .eq("collection_id", parsed.data.collectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Spaced by ten so a title can be slipped between two others without
  // renumbering the whole collection.
  const position = (last?.position ?? 0) + 10;

  const { error } = await supabase.from("collection_items").insert({
    collection_id: parsed.data.collectionId,
    title_id: parsed.data.titleId,
    position,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "That title is already in this collection." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/collections");
  revalidatePath(`/collections/mine/${parsed.data.collectionId}`);
  return { ok: true, message: "Added to collection." };
}

export async function removeFromCollection(
  _prev: CollectionState,
  formData: FormData,
): Promise<CollectionState> {
  await verifySession();

  const parsed = z
    .object({ itemId: idSchema, collectionId: idSchema })
    .safeParse({
      itemId: formData.get("item_id"),
      collectionId: formData.get("collection_id"),
    });

  if (!parsed.success) return { ok: false, error: "Could not remove that title." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", parsed.data.itemId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/collections");
  revalidatePath(`/collections/mine/${parsed.data.collectionId}`);
  return { ok: true, message: "Removed from collection." };
}
