"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AniListClient } from "@/lib/anilist/client";
import { getMediaById, saveListEntry } from "@/lib/anilist/endpoints";
import { AniListAuthError, AniListRateLimitError } from "@/lib/anilist/errors";
import { upsertAniListTitle } from "@/lib/anilist/catalog";
import { toAniListStatus } from "@/lib/anilist/mapping";
import { verifySession } from "@/lib/auth/dal";
import { MAL_LIST_STATUSES } from "@/lib/mal/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AddAniListEntryState =
  | { ok: true; message: string; entryId: number }
  | { ok: false; error: string; needsReauth?: boolean }
  | null;

/**
 * Adds a title that exists on AniList but not on MyAnimeList.
 *
 * The mirror image of addEntry, and deliberately a separate action rather than
 * a branch inside it. addEntry's contract is "MyAnimeList is the source of
 * truth, so write there first and let a failure leave nothing behind"; that
 * sentence is meaningless for a title MAL does not have, and folding both into
 * one function would mean every reader has to work out which half applies.
 *
 * Here AniList is the source of truth, so the same discipline points at it:
 * the AniList write goes first, and nothing is stored locally if it fails. A
 * local-only row would not be cleaned up by any sync — sync-list.ts only ever
 * removes rows MyAnimeList did not return, and it now exempts these outright —
 * so a row written ahead of AniList would linger with nothing behind it.
 *
 * Unlike search, this REQUIRES a connected AniList account: it is a write to
 * the user's list, and there is no anonymous equivalent.
 */

const addSchema = z.object({
  anilistMediaId: z.coerce.number().int().positive(),
  // The app's vocabulary is MAL's throughout, including for a title MAL does
  // not have — the library renders one set of statuses, and storing AniList's
  // here would make this row read differently from every other. Translated on
  // the way out; see lib/anilist/mapping.ts.
  listStatus: z.enum(MAL_LIST_STATUSES).default("plan_to_read"),
});

export async function addAniListEntry(
  _prev: AddAniListEntryState,
  formData: FormData,
): Promise<AddAniListEntryState> {
  const { userId } = await verifySession();

  const parsed = addSchema.safeParse({
    anilistMediaId: formData.get("anilist_media_id"),
    listStatus: formData.get("list_status") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "That title couldn't be added." };
  }

  const { anilistMediaId, listStatus } = parsed.data;

  const admin = createAdminClient();

  // Connected AniList account required — this is a write to their list.
  const { data: connection } = await admin
    .from("anilist_connections")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection || connection.status === "disconnected") {
    return {
      ok: false,
      error: "Connect AniList to add titles MyAnimeList doesn't have.",
    };
  }
  if (connection.status === "needs_reauth") {
    return {
      ok: false,
      needsReauth: true,
      error: "Your AniList connection expired. Please reconnect.",
    };
  }

  // --- AniList first -------------------------------------------------------
  // Re-fetched rather than trusting the posted fields: this is an untrusted
  // entry point, and the catalog row must reflect AniList, not a hand-crafted
  // payload. The same reasoning as addEntry re-fetching the MAL node.
  const client = new AniListClient(userId);

  let media;
  try {
    media = await getMediaById(client, anilistMediaId);
  } catch (cause) {
    if (cause instanceof AniListAuthError) {
      return {
        ok: false,
        needsReauth: true,
        error: "Your AniList connection expired. Please reconnect.",
      };
    }
    if (cause instanceof AniListRateLimitError) {
      return {
        ok: false,
        error: "AniList is rate limiting us. Try again shortly.",
      };
    }
    return { ok: false, error: "AniList couldn't be reached. Try again." };
  }

  if (!media) {
    return { ok: false, error: "AniList no longer has that title." };
  }

  // A title that turns out to have a MAL id does not belong here: addEntry
  // owns those, and storing it through this path would create a second catalog
  // row for a title MAL already covers. Search filters these out, so reaching
  // this means the payload was hand-made or AniList changed its mapping.
  if (media.idMal !== null) {
    return {
      ok: false,
      error: "That title is on MyAnimeList — add it from there instead.",
    };
  }

  try {
    await saveListEntry(client, {
      mediaId: anilistMediaId,
      status: toAniListStatus(listStatus, false),
      progress: 0,
      progressVolumes: 0,
      scoreRaw: 0,
    });
  } catch (cause) {
    if (cause instanceof AniListAuthError) {
      return {
        ok: false,
        needsReauth: true,
        error: "Your AniList connection expired. Please reconnect.",
      };
    }
    if (cause instanceof AniListRateLimitError) {
      return {
        ok: false,
        error: "AniList is rate limiting us. Try again shortly.",
      };
    }
    // Nothing written locally — the cache stays behind AniList, never ahead.
    return {
      ok: false,
      error: `AniList rejected the add: ${(cause as Error).message}`,
    };
  }

  // --- then mirror it ------------------------------------------------------
  const now = new Date().toISOString();

  // Through the RPC, not .upsert(): the uniqueness that keeps AniList-only
  // rows from duplicating is a partial index, and PostgREST cannot restate its
  // predicate for ON CONFLICT. See lib/anilist/catalog.ts.
  let titleId: number;
  try {
    titleId = await upsertAniListTitle(admin, {
      anilistMediaId,
      title: media.title.romaji ?? media.title.english ?? "Untitled",
      titleEn: media.title.english,
      coverUrl: media.coverImage?.large ?? media.coverImage?.medium ?? null,
      format: media.format,
      chapters: media.chapters,
      volumes: media.volumes,
      status: media.status,
      isAdult: media.isAdult,
    });
  } catch (cause) {
    console.error("[add-anilist-entry] catalog upsert failed:", cause);
    return {
      ok: false,
      error: "Added to AniList, but the local copy didn't save. Sync to catch up.",
    };
  }

  const supabase = await createClient();
  const { data: entry, error: entryError } = await supabase
    .from("user_entries")
    .upsert(
      {
        user_id: userId,
        title_id: titleId,
        list_status: listStatus,
        num_chapters_read: 0,
        num_volumes_read: 0,
        score: 0,
        is_rereading: false,
        synced_at: now,
      },
      { onConflict: "user_id,title_id" },
    )
    .select("id")
    .single();

  if (entryError || !entry) {
    // AniList succeeded, so the user's data is safe; only our cache is stale.
    return {
      ok: false,
      error: "Added to AniList, but the local copy didn't save. Sync to catch up.",
    };
  }

  revalidatePath("/library");

  return {
    ok: true,
    entryId: entry.id,
    message: `Added ${media.title.romaji ?? media.title.english} to your AniList list.`,
  };
}
