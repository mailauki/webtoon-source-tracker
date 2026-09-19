"use server";

import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { ALL } from "@/lib/data/library-prefs";
import { createClient } from "@/lib/supabase/server";

/**
 * Remembers the library filter chips between visits.
 *
 * Fire-and-forget by design: the filter chips already navigate, and that
 * navigation is what updates the view. This write only affects the *next*
 * visit, so a failure is silent — losing a remembered filter is not worth
 * interrupting a filter click with an error, and the URL still reflects the
 * choice the user just made.
 *
 * Values are stored as given rather than validated against the live status or
 * source list. A source can be deleted and MAL can rename a status; a stale
 * preference should resolve to an empty grid, not a failed write. The schema
 * only bounds the length, so this cannot be used to stash arbitrary data.
 */

const prefSchema = z.string().trim().max(64).nullable();

const prefsSchema = z.object({
  status: prefSchema.optional(),
  source: prefSchema.optional(),
  // Stored as a `key:direction` pair. Not validated against the known keys —
  // resolveSort() falls back to the default for anything it does not
  // recognise, which is the behaviour we want for a stale preference too.
  sort: prefSchema.optional(),
  // Plain booleans, not the text-with-sentinel the chips use: a toggle has
  // only two meaningful states, so there is no "never chose" to preserve.
  hideHiatus: z.boolean().optional(),
  ownedOnly: z.boolean().optional(),
  // The search page's two switches. Boolean for NSFW, which is off unless
  // asked for; text for the novels/webtoons side, which — like `sort` — is
  // stored as written and resolved leniently on read, so a value this version
  // does not know falls back to the default instead of failing the write.
  includeNsfw: z.boolean().optional(),
  mediaKind: prefSchema.optional(),
});

export type LibraryPrefsPatch = z.input<typeof prefsSchema>;

export async function saveLibraryPrefs(patch: LibraryPrefsPatch) {
  const { userId } = await verifySession();

  const parsed = prefsSchema.safeParse(patch);
  if (!parsed.success) return;

  // Only the keys actually passed get written, so saving a status does not
  // clear the saved source. An empty string is normalised to the explicit
  // `all` sentinel: both mean "show everything", but null already means
  // "never chose", and those must not collapse into each other.
  const row: {
    user_id: string;
    status?: string;
    source?: string;
    sort?: string | null;
    hide_hiatus?: boolean;
    owned_only?: boolean;
    search_include_nsfw?: boolean;
    search_media_kind?: string | null;
  } = {
    user_id: userId,
  };
  if (parsed.data.status !== undefined) {
    row.status = parsed.data.status || ALL;
  }
  if (parsed.data.source !== undefined) {
    row.source = parsed.data.source || ALL;
  }
  // Sort takes no `all` sentinel: there is no unsorted grid, so an empty value
  // is not "show everything" but "no preference", which is exactly null.
  if (parsed.data.sort !== undefined) {
    row.sort = parsed.data.sort || null;
  }
  // Written straight through — false is a real choice ("show them again"), not
  // an empty value to normalise away.
  if (parsed.data.hideHiatus !== undefined) {
    row.hide_hiatus = parsed.data.hideHiatus;
  }
  // Same, read the other way: false is "show the whole shelf again", which is
  // as deliberate a choice as narrowing to what the user owns.
  if (parsed.data.ownedOnly !== undefined) {
    row.owned_only = parsed.data.ownedOnly;
  }
  // Also written straight through: false is "hide them again", which is as
  // deliberate a choice as asking for them.
  if (parsed.data.includeNsfw !== undefined) {
    row.search_include_nsfw = parsed.data.includeNsfw;
  }
  // No `all` sentinel, for the same reason sort has none: the switch always
  // has a side selected, so an empty value is "no preference" — which is null.
  if (parsed.data.mediaKind !== undefined) {
    row.search_media_kind = parsed.data.mediaKind || null;
  }

  if (Object.keys(row).length === 1) return;

  // No revalidatePath: the chip's own navigation re-renders the page, and
  // revalidating here would make every filter click refetch the library twice.
  const supabase = await createClient();
  await supabase.from("library_prefs").upsert(row, { onConflict: "user_id" });
}
