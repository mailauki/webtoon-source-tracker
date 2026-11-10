import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { readAllRows } from "@/lib/data/pagination";
import { rankSources, type Source } from "@/lib/data/rank-sources";

/**
 * The source catalog visible to the current user: every global source, plus
 * their own custom ones. RLS enforces that split — see sources_select_visible.
 *
 * Takes the caller's client when there is no session cookie to read — the
 * iOS app's bearer-token requests.
 */
export async function getSources(client?: SupabaseClient<Database>) {
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase
    .from("sources")
    .select(
      "id, slug, name, base_url, logo_url, owner_id, parent_slug, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Failed to load sources: ${error.message}`);
  return data ?? [];
}

export type { Source };

/**
 * The sources the user reads on most, for the entry page's one-tap adds.
 * Removed (archived) titles do not count. RLS limits the rows to the user's.
 */
export async function getTopSources() {
  const supabase = await createClient();
  const rows = await readAllRows(
    (from, to) =>
      supabase
        .from("entry_sources")
        .select("id, sources ( id, name ), user_entries!inner ( archived_at )", {
          count: "exact",
        })
        .is("user_entries.archived_at", null)
        .order("id")
        .range(from, to),
    "top sources",
  );
  return rankSources(rows);
}

/** MAL's genres, for the removal rules' genre picker. */
export async function getGenres() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tags")
    .select("id, name")
    .eq("kind", "genre")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

/** The user's removal rules, oldest first. RLS scopes them to the caller. */
export async function getRemovalRules() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("removal_rules")
    .select("id, kind, value, from_library, from_mal, from_anilist")
    .order("created_at");
  return data ?? [];
}
