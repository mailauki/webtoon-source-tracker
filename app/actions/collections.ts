"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { nextPosition } from "@/lib/data/collection-items";
import { createClient } from "@/lib/supabase/server";

/**
 * A user's own collections.
 *
 * A user collection is a `collections` row with owner_id set and slug null —
 * the mirror of a curated row, kept apart by collections_shape_ck. None of
 * these actions may touch a curated row: RLS refuses it (every write policy
 * requires `owner_id = auth.uid()`, and a curated row's owner is null), and
 * `owner_id` is never read from the form.
 *
 * verifySession() at the top of each is not belt-and-braces. Server actions
 * are independently reachable HTTP endpoints, so a check anywhere else does
 * not protect them.
 */

export type CollectionState =
  | { error?: string; message?: string; collectionId?: number }
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

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .insert({
      owner_id: userId,
      // Explicitly null: collections_shape_ck rejects a user row that carries
      // a slug, and leaving it to the column default would be a silent
      // dependency on that default staying null.
      slug: null,
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .select("id")
    .single();

  if (error) {
    // collections_owner_name_uniq — scoped per owner, so this only ever means
    // the caller already has one by that name.
    if (error.code === "23505") {
      return { error: "You already have a collection with that name." };
    }
    return { error: error.message };
  }

  revalidatePath("/collections");
  return { message: `Created “${parsed.data.name}”.`, collectionId: data.id };
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

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // RLS restricts this to rows the caller owns, so a curated collection cannot
  // be renamed even if its id is guessed.
  const { error } = await supabase
    .from("collections")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("id", parsed.data.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have a collection with that name." };
    }
    return { error: error.message };
  }

  revalidatePath("/collections");
  revalidatePath(`/collections/${parsed.data.id}`);
  return { message: "Saved." };
}

export async function deleteCollection(
  _prev: CollectionState,
  formData: FormData,
): Promise<CollectionState> {
  await verifySession();

  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { error: "That collection couldn't be deleted." };

  const supabase = await createClient();

  // collection_items cascades from collections, so one delete is enough. The
  // titles themselves are catalog rows and are untouched — deleting a
  // collection removes the grouping, never anything from the library.
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", parsed.data);

  if (error) return { error: error.message };

  revalidatePath("/collections");
  return { message: "Collection deleted." };
}

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

  if (!parsed.success) return { error: "That title couldn't be added." };

  const supabase = await createClient();

  // Read the shelf's positions to append past the end. Racy in principle —
  // two adds at once can land on the same position — and deliberately not
  // guarded, because `position` is not unique by design and ties fall back to
  // insertion order. The cost of losing the race is two titles in id order
  // rather than a failed write.
  const { data: existing, error: readError } = await supabase
    .from("collection_items")
    .select("position")
    .eq("collection_id", parsed.data.collectionId);

  if (readError) return { error: readError.message };

  const { error } = await supabase.from("collection_items").insert({
    collection_id: parsed.data.collectionId,
    title_id: parsed.data.titleId,
    position: nextPosition((existing ?? []).map((row) => row.position)),
    // owner_id is omitted on purpose: collection_items_guard derives it from
    // the parent collection. Sending one would be ignored, and trusting one
    // would be the hole the trigger exists to close.
  });

  if (error) {
    // collection_items_uniq (collection_id, title_id).
    if (error.code === "23505") {
      return { error: "That title is already in this collection." };
    }
    // The guard raises insufficient_privilege / foreign_key_violation for a
    // collection that is not the caller's, and RLS rejects the row when the
    // derived owner_id is not theirs. Either way it is the same answer.
    return { error: "That collection isn't yours to add to." };
  }

  revalidatePath("/collections");
  revalidatePath(`/collections/${parsed.data.collectionId}`);
  return { message: "Added." };
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

  if (!parsed.success) return { error: "That title couldn't be removed." };

  const supabase = await createClient();

  // RLS scopes the delete to the caller's own items; a curated collection's
  // items carry a null owner_id and can never match.
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", parsed.data.itemId);

  if (error) return { error: error.message };

  revalidatePath("/collections");
  revalidatePath(`/collections/${parsed.data.collectionId}`);
  return { message: "Removed." };
}
