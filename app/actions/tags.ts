"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifyAdmin } from "@/lib/auth/dal";
import { slugify } from "@/lib/data/tag-items";
import { createClient } from "@/lib/supabase/server";

/**
 * The tag vocabulary.
 *
 * verifyAdmin() at the top of each is defence in depth that produces a clean
 * error — server actions are independently reachable HTTP endpoints. RLS is
 * what actually stops a forged request: every write policy on tags and
 * title_tags calls private.is_admin() independently of anything decided here.
 *
 * A tag created by MAL is an ordinary editable row. Nothing below special-cases
 * mal_genre_id, because nothing needs to: sync inserts with `do nothing`, so an
 * edit made here is never overwritten.
 */

export type TagState =
  | { error?: string; message?: string; tagId?: number }
  | null;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the tag a name.")
  .max(60, "Keep the name under 60 characters.");

const descriptionSchema = z
  .string()
  .trim()
  .max(200, "Keep the description under 200 characters.")
  .optional();

const kindSchema = z.enum(["genre", "trope", "theme", "format"]);
const idSchema = z.coerce.number().int().positive();

export async function createTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = z
    .object({
      name: nameSchema,
      description: descriptionSchema,
      kind: kindSchema,
    })
    .safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      kind: formData.get("kind") ?? "trope",
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const slug = slugify(parsed.data.name);

  // slugify strips every character outside [a-z0-9]. A name written entirely
  // in non-Latin script or punctuation (e.g. "恋愛", "???") strips to nothing,
  // and an empty string is a perfectly valid value for the not-null slug
  // column — it would insert once, then collide with the *next* such name on
  // the unique index and report "already exists", which is nonsense when the
  // two names share nothing. Reject the empty slug before it can be stored.
  if (slug === "") {
    return {
      error: "That name can't be turned into a URL. Use at least one letter or number.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .insert({
      slug,
      name: parsed.data.name,
      description: parsed.data.description || null,
      kind: parsed.data.kind,
      // Explicitly null: this tag was invented here, not imported. Leaving it
      // to the column default would be a silent dependency on that default.
      mal_genre_id: null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A tag with that name already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/tags");
  return { message: `Created “${parsed.data.name}”.`, tagId: data.id };
}

export async function updateTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = z
    .object({
      id: idSchema,
      name: nameSchema,
      description: descriptionSchema,
      kind: kindSchema,
      isActive: z.coerce.boolean(),
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      kind: formData.get("kind") ?? "trope",
      isActive: formData.get("is_active") === "on",
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // The slug is deliberately NOT recomputed from the new name: it is in URLs
  // (/discover/tag/<slug>), and silently breaking every existing link because
  // somebody fixed a typo would be worse than a slug that reads slightly
  // stale. Renaming the URL is a separate, explicit act.
  const { error } = await supabase
    .from("tags")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      kind: parsed.data.kind,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A tag with that name already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/tags");
  revalidatePath(`/admin/tags/${parsed.data.id}`);
  return { message: "Saved." };
}

export async function deleteTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { error: "That tag couldn't be deleted." };

  const supabase = await createClient();

  // title_tags cascades from tags, so one delete is enough. Note that deleting
  // a MAL-linked tag is not permanent: the next sync's `do nothing` insert
  // finds no row and re-creates it. Retiring (is_active = false) is the real
  // "stop showing this", which is why the UI leads with retire.
  const { error } = await supabase.from("tags").delete().eq("id", parsed.data);

  if (error) return { error: error.message };

  revalidatePath("/admin/tags");
  return { message: "Tag deleted." };
}

export async function tagTitle(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = z
    .object({ tagId: idSchema, titleId: idSchema })
    .safeParse({
      tagId: formData.get("tag_id"),
      titleId: formData.get("title_id"),
    });

  if (!parsed.success) return { error: "That title couldn't be tagged." };

  const supabase = await createClient();

  const { error } = await supabase.from("title_tags").insert({
    tag_id: parsed.data.tagId,
    title_id: parsed.data.titleId,
    // Explicitly null: curated. The insert policy requires it, and a private
    // user tag is a later feature with its own action.
    owner_id: null,
  });

  if (error) {
    // title_tags_curated_uniq (partial index on curated rows; see migration
    // 20260909000002 for why a full three-column constraint doesn't work here).
    if (error.code === "23505") return { error: "Already tagged." };
    return { error: error.message };
  }

  revalidatePath(`/admin/tags/${parsed.data.tagId}`);
  return { message: "Tagged." };
}

export async function untagTitle(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = z
    .object({ tagId: idSchema, titleId: idSchema })
    .safeParse({
      tagId: formData.get("tag_id"),
      titleId: formData.get("title_id"),
    });

  if (!parsed.success) return { error: "That tag couldn't be removed." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("title_tags")
    .delete()
    .eq("tag_id", parsed.data.tagId)
    .eq("title_id", parsed.data.titleId)
    .is("owner_id", null);

  if (error) return { error: error.message };

  revalidatePath(`/admin/tags/${parsed.data.tagId}`);
  return { message: "Removed." };
}
