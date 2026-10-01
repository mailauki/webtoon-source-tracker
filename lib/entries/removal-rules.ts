import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readAllRows } from "@/lib/data/pagination";
import { removeEntryFor, type RemoveInput } from "@/lib/entries/remove-entry";
import type { Database } from "@/lib/supabase/types";

/*
 * Standing removal rules (supabase/migrations/*_removal_rules.sql): take every
 * title with a status, a source or a genre off the shelf, and optionally off
 * MyAnimeList and AniList — now, and whenever another title comes to match.
 *
 * Enforced from the places a title can start matching: when a rule is saved,
 * at the end of a sync (new titles, changed statuses, new genres), after a
 * status change, and after a source is attached. Each removal goes through
 * removeEntryFor, the same function as the remove dialog, so the order (sites
 * first, archive last) and every per-title check hold unchanged.
 */

export type RuleKind = "status" | "source" | "genre";
export type RemovalRule = Pick<
  Database["public"]["Tables"]["removal_rules"]["Row"],
  "id" | "kind" | "value" | "from_library" | "from_mal" | "from_anilist"
>;

/** What a rule is matched against: one shelf row, as loaded below. */
export type RuleCandidate = {
  id: number;
  list_status: string;
  sync_to_mal: boolean;
  sync_to_anilist: boolean;
  media_titles: {
    mal_media_id: number | null;
    anilist_media_id: number | null;
    title_tags: { tag_id: number }[];
  };
  entry_sources: { source_id: number }[];
};

export function matchesRule(rule: RemovalRule, entry: RuleCandidate): boolean {
  switch (rule.kind as RuleKind) {
    case "status":
      return entry.list_status === rule.value;
    case "source":
      return entry.entry_sources.some((es) => String(es.source_id) === rule.value);
    case "genre":
      return entry.media_titles.title_tags.some((t) => String(t.tag_id) === rule.value);
    default:
      return false;
  }
}

/**
 * Where one title should be removed from, across every rule it matches, or
 * null when there is nothing left to do.
 *
 * A site is dropped when the title is not on it or has already been taken
 * off it: removeEntryFor turns that site's syncing off after deleting there,
 * so `sync_to_*` false is how "done" is remembered. Without that, a
 * MyAnimeList-only rule would delete the same title again on every sync.
 */
export function removalTargets(
  rules: RemovalRule[],
  entry: RuleCandidate,
): Omit<RemoveInput, "entryId"> | null {
  const matched = rules.filter((rule) => matchesRule(rule, entry));
  if (matched.length === 0) return null;

  const targets = {
    fromLibrary: matched.some((r) => r.from_library),
    fromMal:
      matched.some((r) => r.from_mal) &&
      entry.sync_to_mal &&
      entry.media_titles.mal_media_id !== null,
    fromAniList:
      matched.some((r) => r.from_anilist) &&
      entry.sync_to_anilist &&
      entry.media_titles.anilist_media_id !== null,
  };
  return targets.fromLibrary || targets.fromMal || targets.fromAniList
    ? targets
    : null;
}

export type EnforceResult = {
  removed: number;
  failed: number;
  /** Why the run stopped early, if it did; the rest wait for the next run. */
  stopped?: string;
};

/**
 * Most removals one run makes. Each can be two remote deletes, and this runs
 * inside a sync or a save, so a new rule matching a whole library is worked
 * through over several runs rather than in one request that times out.
 */
const PER_RUN = 50;

/**
 * Applies the user's rules to their shelf, or to just `entryIds` after an
 * edit to those titles. Never throws for a single title: a failure is counted
 * and the next title is tried, except an expired login or a rate limit, which
 * would fail every remaining title the same way.
 */
export async function enforceRemovalRules(
  supabase: SupabaseClient<Database>,
  userId: string,
  entryIds?: number[],
): Promise<EnforceResult> {
  const result: EnforceResult = { removed: 0, failed: 0 };

  const { data: rules, error: rulesError } = await supabase
    .from("removal_rules")
    .select("id, kind, value, from_library, from_mal, from_anilist")
    .eq("user_id", userId);
  if (rulesError || !rules?.length) return result;

  const select = `id, list_status, sync_to_mal, sync_to_anilist,
    media_titles!inner ( mal_media_id, anilist_media_id, title_tags ( tag_id ) ),
    entry_sources ( source_id )`;

  const rows = entryIds
    ? ((
        await supabase
          .from("user_entries")
          .select(select)
          .eq("user_id", userId)
          .is("archived_at", null)
          .in("id", entryIds)
      ).data ?? [])
    : await readAllRows(
        (from, to) =>
          supabase
            .from("user_entries")
            .select(select, { count: "exact" })
            .eq("user_id", userId)
            .is("archived_at", null)
            .order("id")
            .range(from, to),
        "titles for removal rules",
      );

  for (const row of rows as unknown as RuleCandidate[]) {
    if (result.removed + result.failed >= PER_RUN) break;
    const targets = removalTargets(rules, row);
    if (!targets) continue;

    const state = await removeEntryFor(supabase, userId, {
      entryId: row.id,
      ...targets,
    });
    if (state?.ok) {
      result.removed++;
      continue;
    }
    result.failed++;
    if (state && !state.ok && (state.needsReauth || state.rateLimited)) {
      result.stopped = state.error;
      break;
    }
  }

  return result;
}
