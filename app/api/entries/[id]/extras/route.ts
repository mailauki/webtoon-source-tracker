import { userClientFromBearer } from "@/lib/auth/app-link";
import { getMediaExtras } from "@/lib/anilist/endpoints";
import { malGenresFor } from "@/lib/anilist/genres";
import { hidesMature } from "@/lib/data/age";
import { chapterDifference, higherChapterCount } from "@/lib/data/anilist-links";
import { mergeAuthors } from "@/lib/data/author-works";
import { mergeTags, sortTags } from "@/lib/data/tag-items";
import { getTagsForMalGenres, getTagsForTitle } from "@/lib/data/tags";
import { getMalLiveDetails } from "@/lib/mal/endpoints";

const SITE_NAMES = { mal: "MyAnimeList", anilist: "AniList" } as const;

/**
 * What the entry page shows from MyAnimeList and AniList live, for the iOS
 * app, authenticated by its Supabase access token — the parts of
 * app/entry/[id]/page.tsx the app can't read from the database itself.
 *
 * Reply: `{ tags, authors, authorMismatches, chapterDifference, total }`:
 * - `tags`: the saved tags merged with both sites' live genres, sorted, each
 *   `{ id, slug, name, kind, fromApi }`; adult kinds screened as the user's
 *   setting says.
 * - `authors`: both sites' credits merged, each `{ name, roles }`.
 * - `authorMismatches` / `chapterDifference`: where the two sites disagree,
 *   as the sentences the web shows; only for a title MyAnimeList has.
 * - `total`: the higher of the stored and both sites' chapter counts.
 *
 * Either site being slow or down costs only its part, as on the web page.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/entries/[id]/extras">,
) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const entryId = Number((await params).id);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // RLS: someone else's entry reads as missing, as on the web page.
  const [{ data: entry }, profile, prefs] = await Promise.all([
    user.supabase
      .from("user_entries")
      .select("media_titles!inner (id, mal_media_id, anilist_media_id, num_chapters)")
      .eq("id", entryId)
      .maybeSingle(),
    user.supabase.from("profiles").select("age_range").eq("id", user.userId).maybeSingle(),
    user.supabase.from("library_prefs").select("hide_nsfw").eq("user_id", user.userId).maybeSingle(),
  ]);
  if (!entry) return Response.json({ error: "Not found" }, { status: 404 });

  const title = entry.media_titles;
  // hidesMatureTitles' rule, and hidden outright if either row can't be
  // read: an unknown answer to "may this be shown?" is no.
  const reader = {
    supabase: user.supabase,
    hideMature:
      Boolean(profile.error || prefs.error) ||
      hidesMature(profile.data?.age_range, prefs.data?.hide_nsfw),
  };

  const [media, mal, saved] = await Promise.all([
    getMediaExtras({
      anilistMediaId: title.anilist_media_id,
      malMediaId: title.mal_media_id,
    }),
    title.mal_media_id === null ? null : getMalLiveDetails(title.mal_media_id),
    getTagsForTitle(title.id, reader),
  ]);
  const live = await getTagsForMalGenres(
    [
      ...(mal?.genres ?? []).map((genre) => genre.id),
      ...malGenresFor(media?.genres).map((genre) => genre.id),
    ],
    reader,
  );

  // A genre either site gives right now counts as the API's, even before a
  // sync has marked the saved link — as the web page locks it.
  const fromApi = new Set([
    ...saved.filter((tag) => tag.from_api).map((tag) => tag.id),
    ...live.map((tag) => tag.id),
  ]);
  const { authors, mismatches } = mergeAuthors(mal?.authors ?? null, media?.staff);
  const malChapters = mal?.numChapters ?? title.num_chapters;
  const onMal = title.mal_media_id !== null;

  return Response.json({
    tags: sortTags(mergeTags(saved, live)).map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      name: tag.name,
      kind: tag.kind,
      fromApi: fromApi.has(tag.id),
    })),
    authors: authors.map((author) => ({ name: author.name, roles: author.roles })),
    authorMismatches: onMal
      ? mismatches.map((mismatch) =>
          mismatch.kind === "missing"
            ? `${mismatch.name} is credited on ${SITE_NAMES[mismatch.creditedBy]} only.`
            : `${mismatch.name}: ${mismatch.mal} on MyAnimeList, ${mismatch.anilist} on AniList.`,
        )
      : [],
    // No AniList answer means nothing to compare against, not a difference.
    chapterDifference: onMal && media ? chapterDifference(malChapters, media.chapters) : null,
    total: higherChapterCount(title.num_chapters, onMal ? malChapters : null, media?.chapters),
  });
}
