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
  const row: { user_id: string; status?: string; source?: string } = {
    user_id: userId,
  };
  if (parsed.data.status !== undefined) {
    row.status = parsed.data.status || ALL;
  }
  if (parsed.data.source !== undefined) {
    row.source = parsed.data.source || ALL;
  }

  if (Object.keys(row).length === 1) return;

  // No revalidatePath: the chip's own navigation re-renders the page, and
  // revalidating here would make every filter click refetch the library twice.
  const supabase = await createClient();
  await supabase.from("library_prefs").upsert(row, { onConflict: "user_id" });
}
