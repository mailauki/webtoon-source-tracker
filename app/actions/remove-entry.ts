"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AniListClient } from "@/lib/anilist/client";
import { deleteListEntry } from "@/lib/anilist/endpoints";
import { AniListAuthError, AniListRateLimitError } from "@/lib/anilist/errors";
import { verifySession } from "@/lib/auth/dal";
import { MalClient } from "@/lib/mal/client";
import { deleteListStatus } from "@/lib/mal/endpoints";
import { MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RemoveEntryState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

/**
 * Takes a title off the shelf, and optionally off the sites it came from.
 *
 * Three targets, each opted into separately, because they are not equally
 * reversible:
 *
 *   library  — archives the row. entry_sources is kept, so the hand-entered
 *              URLs, per-source progress and notes survive and the removal can
 *              be undone. See the archived_at migration.
 *   mal      — DELETE on the user's MyAnimeList list. Irreversible there.
 *   anilist  — the same on AniList. Irreversible there.
 *
 * Remote first, local last, which is the same ordering addEntry and
 * updateProgress use and for the same reason: the local row is a cache of the
 * services, so it must never claim something the services have not agreed to.
 * A remote failure leaves the entry exactly where it was.
 *
 * Archiving rather than deleting is what makes the local half safe to offer
 * beside the remote ones. If it were a cascade, a single mis-aimed click would
 * destroy source data no sync could rebuild.
 */

const removeSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  fromLibrary: z.coerce.boolean().default(false),
  fromMal: z.coerce.boolean().default(false),
  fromAniList: z.coerce.boolean().default(false),
});

export async function removeEntry(
  _prev: RemoveEntryState,
  formData: FormData,
): Promise<RemoveEntryState> {
  const { userId } = await verifySession();

  const parsed = removeSchema.safeParse({
    entryId: formData.get("entry_id"),
    // Unchecked boxes are absent from FormData entirely, so presence is the
    // value. Coercing the string "on" would be the same, but this does not
    // depend on the input's value attribute.
    fromLibrary: formData.get("from_library") !== null,
    fromMal: formData.get("from_mal") !== null,
    fromAniList: formData.get("from_anilist") !== null,
  });

  if (!parsed.success) {
    return { ok: false, error: "That title couldn't be removed." };
  }

  const { entryId, fromLibrary, fromMal, fromAniList } = parsed.data;

  if (!fromLibrary && !fromMal && !fromAniList) {
    return { ok: false, error: "Choose where to remove this title from." };
  }

  const supabase = await createClient();
  const { data: entry, error: loadError } = await supabase
    .from("user_entries")
    .select(
      "id, user_id, media_titles!inner (id, title, mal_media_id, anilist_media_id)",
    )
    .eq("id", entryId)
    .maybeSingle();

  if (loadError || !entry) {
    return { ok: false, error: "That title isn't in your library." };
  }
  // RLS already scopes the read, but the writes below target a specific id.
  if (entry.user_id !== userId) {
    return { ok: false, error: "That title isn't in your library." };
  }

  const title = entry.media_titles;
  const done: string[] = [];

  // --- MyAnimeList ---------------------------------------------------------
  if (fromMal) {
    if (title.mal_media_id === null) {
      return {
        ok: false,
        error: "MyAnimeList doesn't have this title, so there's nothing to remove there.",
      };
    }

    try {
      await deleteListStatus(new MalClient(userId), title.mal_media_id);
      done.push("MyAnimeList");
    } catch (cause) {
      if (cause instanceof MalAuthError) {
        return {
          ok: false,
          error: "Your MyAnimeList connection expired. Please reconnect.",
        };
      }
      if (cause instanceof MalRateLimitError) {
        return {
          ok: false,
          error: "MyAnimeList is rate limiting us. Try again shortly.",
        };
      }
      // Nothing local has changed yet, so the entry is intact.
      return {
        ok: false,
        error: `MyAnimeList wouldn't remove it: ${(cause as Error).message}`,
      };
    }
  }

  // --- AniList -------------------------------------------------------------
  if (fromAniList) {
    if (title.anilist_media_id === null) {
      return {
        ok: false,
        error: "This title isn't matched to AniList, so there's nothing to remove there.",
      };
    }

    const admin = createAdminClient();
    const { data: connection } = await admin
      .from("anilist_connections")
      .select("status, anilist_user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!connection || connection.status !== "active") {
      return {
        ok: false,
        error: "Connect AniList to remove titles from it.",
      };
    }

    try {
      const removed = await deleteListEntry(
        new AniListClient(userId),
        connection.anilist_user_id,
        title.anilist_media_id,
      );
      // `false` means it was not on the list — the intent is satisfied either
      // way, so this is not an error, but it should not be claimed as an
      // action that happened.
      if (removed) done.push("AniList");
    } catch (cause) {
      if (cause instanceof AniListAuthError) {
        return {
          ok: false,
          error: "Your AniList connection expired. Please reconnect.",
        };
      }
      if (cause instanceof AniListRateLimitError) {
        return {
          ok: false,
          error: "AniList is rate limiting us. Try again shortly.",
        };
      }
      return {
        ok: false,
        error: `AniList wouldn't remove it: ${(cause as Error).message}`,
      };
    }
  }

  // --- The library, last ---------------------------------------------------
  if (fromLibrary) {
    const { error: archiveError } = await supabase
      .from("user_entries")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", entryId);

    if (archiveError) {
      return {
        ok: false,
        error: done.length
          ? `Removed from ${done.join(" and ")}, but it's still in your library. Try again.`
          : "That title couldn't be removed.",
      };
    }
    done.unshift("your library");
  } else if (fromMal || fromAniList) {
    // Removed from a site but kept locally. The next sync would read its
    // absence there as a reason to act, so the matching exclusion is set:
    // without this the title either comes back or gets archived by the sync,
    // neither of which the user asked for.
    const { error: flagError } = await supabase
      .from("user_entries")
      .update({
        ...(fromMal ? { sync_to_mal: false } : {}),
        ...(fromAniList ? { sync_to_anilist: false } : {}),
      })
      .eq("id", entryId);

    if (flagError) {
      return {
        ok: false,
        error: `Removed from ${done.join(" and ")}, but syncing wasn't turned off for it — it may come back on the next sync.`,
      };
    }
  }

  revalidatePath("/library");
  revalidatePath(`/entry/${entryId}`);

  return {
    ok: true,
    message: done.length
      ? `Removed ${title.title} from ${done.join(" and ")}.`
      : `${title.title} wasn't on the lists you chose.`,
  };
}

/** Puts an archived title back on the shelf. */
export async function restoreEntry(
  _prev: RemoveEntryState,
  formData: FormData,
): Promise<RemoveEntryState> {
  const { userId } = await verifySession();

  const entryId = Number(formData.get("entry_id"));
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return { ok: false, error: "That title couldn't be restored." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_entries")
    .update({ archived_at: null })
    .eq("id", entryId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "That title couldn't be restored." };
  }

  revalidatePath("/library");
  revalidatePath("/settings");
  return { ok: true, message: "Title restored." };
}
