import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  rankSources,
  type RankedSource,
  type Source,
} from "@/lib/data/rank-sources";

/**
 * The source catalog visible to the current user: every global source, plus
 * their own custom ones. RLS enforces that split — see sources_select_visible.
 */
export async function getSources() {
  const supabase = await createClient();

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
 * The sources this user attaches most often, for the card menu's quick-add.
 *
 * RLS scopes entry_sources to the caller, so no explicit user filter is
 * needed — the same reason getSources can select the whole table.
 */
export async function getTopSources(): Promise<RankedSource[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("entry_sources")
    .select("source_id, sources ( id, name )");

  // A failure here costs shortcuts, not the library — degrade to no shortcuts
  // rather than taking the whole page down.
  if (error) return [];
  return rankSources(data ?? []);
}
