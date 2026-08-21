import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The source catalog visible to the current user: every global source, plus
 * their own custom ones. RLS enforces that split — see sources_select_visible.
 */
export async function getSources() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sources")
    .select("id, slug, name, base_url, logo_url, owner_id, parent_slug, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Failed to load sources: ${error.message}`);
  return data ?? [];
}

export type Source = Awaited<ReturnType<typeof getSources>>[number];
