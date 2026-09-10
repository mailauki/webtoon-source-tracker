"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifyAdmin } from "@/lib/auth/dal";
import { nextPosition } from "@/lib/data/collection-items";
import { slugify } from "@/lib/data/tag-items";
import { createClient } from "@/lib/supabase/server";

/**
 * The curated collections that populate /discover's editorial shelves.
 *
 * A curated collection is a `collections` row with owner_id null and slug set
 * — the mirror of a user's own collection, kept apart by collections_shape_ck.
 * None of these actions may touch a user's row: every write below sets or
 * filters owner_id to null, and RLS agrees independently (the Task 2 policies
 * — collections_insert_curated etc. — all require `owner_id is null AND
 * private.is_admin()`). This file does not decide that boundary; it only has
 * to not fight it.
 *
 * verifyAdmin() at the top of each is defence in depth that produces a clean
 * error — server actions are independently reachable HTTP endpoints, so a
 * check anywhere else (a layout, a nav guard) does not protect them.
 */

export type AdminCollectionState =
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

export async function createCuratedCollection(
  _prev: AdminCollectionState,
  formData: FormData,
): Promise<AdminCollectionState> {
  await verifyAdmin();

  const parsed = z
    .object({ name: nameSchema, description: descriptionSchema })
    .safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // The form may override the generated slug; an explicit blank falls back to
  // slugify(name) rather than being sent through as-is.
  const rawSlug = formData.get("slug");
  const slug =
    typeof rawSlug === "string" && rawSlug.trim() !== ""
      ? slugify(rawSlug)
      : slugify(parsed.data.name);

  // slugify strips every character outside [a-z0-9]. A name written entirely
  // in non-Latin script or punctuation (e.g. "恋愛", "???") strips to nothing,
  // and an empty string is a perfectly valid value for the unique slug column
  // — it would insert once, then collide with the *next* such name on the
  // unique index and report "already exists", which is nonsense when the two
  // names share nothing. Reject the empty slug before it can be stored.
  if (slug === "") {
    return {
      error: "That name can't be turned into a URL. Use at least one letter or number.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .insert({
      // Explicitly null: collections_shape_ck requires it alongside a slug,
      // and leaving it to the column default would be a silent dependency on
      // that default staying null. RLS's collections_insert_curated policy
      // requires the same, independently of this.
      owner_id: null,
      slug,
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .select("id")
    .single();

  if (error) {
    // collections_owner_name_uniq is (owner_id, name), and every curated row
    // shares owner_id null — Postgres treats NULLs as distinct, so that
    // constraint is trivially satisfied by any number of curated rows sharing
    // a name and never fires here. The slug's unique index is the only thing
    // that actually constrains a curated row, so a 23505 here always means
    // "that slug is taken", not "that name is taken".
    if (error.code === "23505") {
      return { error: "A collection with that slug already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/discover");
  revalidatePath("/admin/collections");
  return { message: `Created “${parsed.data.name}”.`, collectionId: data.id };
}

export async function updateCuratedCollection(
  _prev: AdminCollectionState,
  formData: FormData,
): Promise<AdminCollectionState> {
  await verifyAdmin();

  const parsed = z
    .object({
      id: idSchema,
      name: nameSchema,
      description: descriptionSchema,
      isActive: z.coerce.boolean(),
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      // A checkbox sends nothing at all when unchecked, so an absent field is
      // "retired" rather than a missing value — the same read updateTag makes.
      isActive: formData.get("is_active") === "on",
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // No database constraint stops two curated collections from sharing a name
  // (see the comment on the 23505 branch in createCuratedCollection above),
  // and this action never touches slug, so no unique index is even in reach
  // of this update. Two indistinguishable shelves on /discover is a bad
  // outcome an admin can't easily diagnose after the fact, so the check is
  // made explicit here instead: reject a rename that collides with another
  // curated row's name before it can happen.
  //
  // Read-then-write, so two admins renaming to the same name at the same
  // instant can both pass this and both commit. Deliberately not closed: the
  // only real fix is a partial unique index on (name) where owner_id is null,
  // which would also forbid names that already collide today, and there is
  // exactly one admin. The cost of losing that race is two shelves to rename,
  // not corruption.
  const { data: collision, error: collisionError } = await supabase
    .from("collections")
    .select("id")
    .is("owner_id", null)
    .eq("name", parsed.data.name)
    .neq("id", parsed.data.id)
    .maybeSingle();

  if (collisionError) return { error: collisionError.message };
  if (collision) {
    return { error: "A collection with that name already exists." };
  }

  // The slug is deliberately NOT editable here: it is in URLs
  // (/discover/collection/<slug>), and this action mirrors updateTag's choice
  // to keep renames of the name separate from renames of the URL.
  //
  // is_active IS editable, and is how a curated shelf is withdrawn from
  // /discover without deleting it and its hand-ordered items. Deleting is the
  // separate, confirmed act below.
  //
  // .is("owner_id", null) matches the RLS policy's own condition. It changes
  // nothing RLS wouldn't already refuse — a user collection has no matching
  // curated row to update — but it means a bad id fails the same way a
  // wrong-shape id would, rather than by relying solely on the database.
  const { error } = await supabase
    .from("collections")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.id)
    .is("owner_id", null);

  if (error) return { error: error.message };

  revalidatePath("/discover");
  revalidatePath("/admin/collections");
  revalidatePath(`/admin/collections/${parsed.data.id}`);
  return { message: "Saved." };
}

export async function deleteCuratedCollection(
  _prev: AdminCollectionState,
  formData: FormData,
): Promise<AdminCollectionState> {
  await verifyAdmin();

  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { error: "That collection couldn't be deleted." };

  const supabase = await createClient();

  // collection_items cascades from collections, so one delete is enough. The
  // titles themselves are catalog rows and are untouched — deleting a curated
  // collection removes the editorial shelf, never anything from the library.
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", parsed.data)
    .is("owner_id", null);

  if (error) return { error: error.message };

  revalidatePath("/discover");
  revalidatePath("/admin/collections");
  return { message: "Collection deleted." };
}

export async function addTitleToCurated(
  _prev: AdminCollectionState,
  formData: FormData,
): Promise<AdminCollectionState> {
  await verifyAdmin();

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
    // Every other error falls through to the database's own message, the same
    // convention every sibling action in this file and in
    // app/actions/collections.ts follows. A bad title_id raises 23503
    // (collection_items_title_id_fkey), and RLS rejecting the insert because
    // the target collection isn't curated is a different failure again — both
    // deserve their own message rather than being flattened into "that
    // collection isn't a curated one," which is only true for the second.
    return { error: error.message };
  }

  revalidatePath("/discover");
  revalidatePath(`/admin/collections/${parsed.data.collectionId}`);
  return { message: "Added." };
}

export async function removeTitleFromCurated(
  _prev: AdminCollectionState,
  formData: FormData,
): Promise<AdminCollectionState> {
  await verifyAdmin();

  const parsed = z
    .object({ itemId: idSchema, collectionId: idSchema })
    .safeParse({
      itemId: formData.get("item_id"),
      collectionId: formData.get("collection_id"),
    });

  if (!parsed.success) return { error: "That title couldn't be removed." };

  const supabase = await createClient();

  // .is("owner_id", null) matches collection_items_delete_curated: a user's
  // own item can never match, so this can only ever remove a curated one.
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("id", parsed.data.itemId)
    .is("owner_id", null);

  if (error) return { error: error.message };

  revalidatePath("/discover");
  revalidatePath(`/admin/collections/${parsed.data.collectionId}`);
  return { message: "Removed." };
}

export async function moveCuratedItem(
  _prev: AdminCollectionState,
  formData: FormData,
): Promise<AdminCollectionState> {
  await verifyAdmin();

  const parsed = z
    .object({
      collectionId: idSchema,
      itemId: idSchema,
      direction: z.enum(["up", "down"]),
    })
    .safeParse({
      collectionId: formData.get("collection_id"),
      itemId: formData.get("item_id"),
      direction: formData.get("direction"),
    });

  if (!parsed.success) return { error: "That title couldn't be moved." };

  const supabase = await createClient();

  // .is("owner_id", null) matches collection_items_delete_curated /
  // collection_items_update_own's boundary: a user's own item can never
  // appear in `ordered`, so this can only ever reorder curated items.
  const { data: items, error: readError } = await supabase
    .from("collection_items")
    .select("id, position")
    .eq("collection_id", parsed.data.collectionId)
    .is("owner_id", null)
    .order("position")
    .order("id");

  if (readError) return { error: readError.message };

  const ordered = items ?? [];
  const index = ordered.findIndex((row) => row.id === parsed.data.itemId);

  // itemId not found among this collection's curated items: either it
  // belongs to someone's private collection (an admin also has one and
  // guessed/reused an id) or it doesn't exist at all. Either way it is not a
  // legitimate no-op like "already at the end" below, so it gets its own
  // error rather than folding into the silent-null branch.
  if (index === -1) {
    return { error: "That title isn't in this collection." };
  }

  const swapWith = parsed.data.direction === "up" ? index - 1 : index + 1;

  // Already at the end it is being moved toward: succeed silently rather than
  // erroring, so a double-click on the top item is a no-op and not a toast.
  if (swapWith < 0 || swapWith >= ordered.length) {
    return null;
  }

  // Two updates, not one statement: `position` is deliberately not unique
  // (see the collections migration), so swapping needs no temporary value.
  const a = ordered[index];
  const b = ordered[swapWith];

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase
      .from("collection_items")
      .update({ position: b.position })
      .eq("id", a.id)
      .is("owner_id", null),
    supabase
      .from("collection_items")
      .update({ position: a.position })
      .eq("id", b.id)
      .is("owner_id", null),
  ]);

  if (e1 || e2) return { error: (e1 ?? e2)!.message };

  revalidatePath(`/admin/collections/${parsed.data.collectionId}`);
  revalidatePath("/discover");
  return null;
}
