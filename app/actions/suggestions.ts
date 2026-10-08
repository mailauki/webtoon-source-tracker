"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifyAdmin, verifySession } from "@/lib/auth/dal";
import { slugify } from "@/lib/data/tag-items";
import { createClient } from "@/lib/supabase/server";

/**
 * Reader suggestions (a tag for a title, a collection for Discover) and the
 * admin's review of them. See migration 20261008200000 for the tables.
 *
 * A pending suggestion is a row; approving applies it and deletes the row,
 * rejecting just deletes it. RLS scopes every write: a reader may only insert
 * their own rows, and only an admin may delete anyone else's.
 */

export type SuggestionState = { error?: string; message?: string } | null;

const idSchema = z.coerce.number().int().positive();
const decisionSchema = z.enum(["approve", "reject"]);

export async function suggestTag(
  _prev: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  const { userId } = await verifySession();

  const parsed = z
    .object({ tagId: idSchema, titleId: idSchema })
    .safeParse({
      tagId: formData.get("tag_id"),
      titleId: formData.get("title_id"),
    });

  if (!parsed.success) return { error: "That tag couldn't be suggested." };

  const supabase = await createClient();

  const { error } = await supabase.from("tag_suggestions").insert({
    user_id: userId,
    tag_id: parsed.data.tagId,
    title_id: parsed.data.titleId,
  });

  if (error) {
    if (error.code === "23505") return { error: "You've already suggested that tag." };
    return { error: error.message };
  }

  revalidatePath("/admin/suggestions");
  return { message: "Suggested — an admin will review it." };
}

export async function suggestCollection(
  _prev: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  const { userId } = await verifySession();

  const parsed = idSchema.safeParse(formData.get("collection_id"));
  if (!parsed.success) return { error: "That collection couldn't be suggested." };

  const supabase = await createClient();

  // RLS (collection_suggestions_insert_own) refuses a collection that isn't
  // the caller's.
  const { error } = await supabase.from("collection_suggestions").insert({
    user_id: userId,
    collection_id: parsed.data,
  });

  if (error) {
    if (error.code === "23505") return { error: "Already suggested." };
    return { error: error.message };
  }

  revalidatePath(`/discover/collections/${parsed.data}`);
  revalidatePath("/admin/suggestions");
  return { message: "Suggested — an admin will review it." };
}

export async function reviewTagSuggestion(
  _prev: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  await verifyAdmin();

  const parsed = z
    .object({ id: idSchema, decision: decisionSchema })
    .safeParse({ id: formData.get("id"), decision: formData.get("decision") });

  if (!parsed.success) return { error: "That suggestion couldn't be reviewed." };

  const supabase = await createClient();

  const { data: suggestion, error: readError } = await supabase
    .from("tag_suggestions")
    .select("title_id, tag_id")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (readError) return { error: readError.message };
  if (!suggestion) return { error: "That suggestion is gone." };

  if (parsed.data.decision === "reject") {
    const { error } = await supabase
      .from("tag_suggestions")
      .delete()
      .eq("id", parsed.data.id);
    if (error) return { error: error.message };
    revalidatePath("/admin/suggestions");
    return { message: "Rejected." };
  }

  const { error: tagError } = await supabase.from("title_tags").insert({
    tag_id: suggestion.tag_id,
    title_id: suggestion.title_id,
    owner_id: null,
    from_api: false,
  });

  // 23505: already tagged (title_tags_curated_uniq) — still a yes, so the
  // suggestion is cleared below either way.
  if (tagError && tagError.code !== "23505") return { error: tagError.message };

  // Every reader who suggested the same tag on the same title is answered.
  const { error } = await supabase
    .from("tag_suggestions")
    .delete()
    .eq("title_id", suggestion.title_id)
    .eq("tag_id", suggestion.tag_id);

  if (error) return { error: error.message };

  revalidatePath("/admin/suggestions");
  revalidatePath(`/admin/tags/${suggestion.tag_id}`);
  return { message: "Tagged." };
}

export async function reviewCollectionSuggestion(
  _prev: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  await verifyAdmin();

  const parsed = z
    .object({ id: idSchema, decision: decisionSchema })
    .safeParse({ id: formData.get("id"), decision: formData.get("decision") });

  if (!parsed.success) return { error: "That suggestion couldn't be reviewed." };

  const supabase = await createClient();

  if (parsed.data.decision === "reject") {
    const { error } = await supabase
      .from("collection_suggestions")
      .delete()
      .eq("id", parsed.data.id);
    if (error) return { error: error.message };
    revalidatePath("/admin/suggestions");
    return { message: "Rejected." };
  }

  const { data: suggestion, error: readError } = await supabase
    .from("collection_suggestions")
    .select("collections (name)")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (readError) return { error: readError.message };
  if (!suggestion?.collections) return { error: "That suggestion is gone." };

  // A name in non-Latin script slugifies to nothing; fall back to the id so
  // it still gets a URL.
  const base = slugify(suggestion.collections.name) || `collection-${parsed.data.id}`;

  let { error } = await supabase.rpc("approve_collection_suggestion", {
    p_suggestion_id: parsed.data.id,
    p_slug: base,
  });

  // A curated shelf already owns that slug: retry once with the suggestion id
  // on the end rather than leave the suggestion unapprovable.
  if (error?.code === "23505") {
    ({ error } = await supabase.rpc("approve_collection_suggestion", {
      p_suggestion_id: parsed.data.id,
      p_slug: `${base}-${parsed.data.id}`,
    }));
  }

  if (error) return { error: error.message };

  revalidatePath("/discover");
  revalidatePath("/admin/collections");
  revalidatePath("/admin/suggestions");
  return { message: "Added to Discover." };
}
