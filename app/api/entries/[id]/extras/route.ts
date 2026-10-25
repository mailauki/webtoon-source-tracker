import { userClientFromBearer } from "@/lib/auth/app-link";
import { getMediaExtras } from "@/lib/anilist/endpoints";
import { malGenresFor } from "@/lib/anilist/genres";
import { hidesMature } from "@/lib/data/age";
import { chapterDifference, higherChapterCount } from "@/lib/data/anilist-links";
import { authorWorks, mergeAuthors, relatedWorks, withMalWorks } from "@/lib/data/author-works";
import { getLibraryMatches } from "@/lib/data/entries";
import { POSTER_SOURCE_LABELS, posterOptions } from "@/lib/data/entry-cover";
import { findMalLink } from "@/lib/data/mal-link";
import { hasPro } from "@/lib/data/pro";
import { mergeTags, sortTags } from "@/lib/data/tag-items";
import { getTagsForMalGenres, getTagsForTitle } from "@/lib/data/tags";
import { getMalLiveDetails } from "@/lib/mal/endpoints";
import { getPersonManga } from "@/lib/mal/jikan";
import { searchOtherSiteUrl } from "@/lib/sync/unmatched-titles";

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
 * - `posters`: every poster the picker offers, `{ url, label }`, in its
 *   order — the catalog's (what a reset goes back to) first.
 * - `malLink`: only for a title AniList alone has — what MyAnimeList seems
 *   to call it (`found`), its entry in the library if it can be merged
 *   (`twin`), and AniList's edit page and a MyAnimeList search. Null else.
 * - `works`: Pro only (null without it) — the authors' other works, each
 *   `{ title, entryId }` with `title` shaped as a Search result so the app's
 *   catalog card can add it, and `entryId` set when it's already tracked.
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
  const [{ data: entry }, profile, prefs, isPro] = await Promise.all([
    user.supabase
      .from("user_entries")
      .select(
        "cover_url, media_titles!inner (id, mal_media_id, anilist_media_id, num_chapters, main_picture_url, title, title_en, alt_titles, mal_media_kind)",
      )
      .eq("id", entryId)
      .maybeSingle(),
    user.supabase.from("profiles").select("age_range").eq("id", user.userId).maybeSingle(),
    user.supabase.from("library_prefs").select("hide_nsfw").eq("user_id", user.userId).maybeSingle(),
    hasPro(user.supabase, user.userId),
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

  const anilistOnly = title.mal_media_id === null && title.anilist_media_id !== null;
  const [media, mal, saved, malLink] = await Promise.all([
    // With Pro, the same AniList request also carries the authors' works.
    getMediaExtras({
      anilistMediaId: title.anilist_media_id,
      malMediaId: title.mal_media_id,
      withWorks: isPro,
    }),
    title.mal_media_id === null ? null : getMalLiveDetails(title.mal_media_id),
    getTagsForTitle(title.id, reader),
    // A live MAL search, so only for the titles it's about.
    anilistOnly
      ? findMalLink(user.supabase, entryId, { ...title, anilist_media_id: title.anilist_media_id! })
      : null,
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

  // As the entry page's AuthorWorks: AniList's on the response above, plus
  // MyAnimeList's by Jikan — capped, since it allows about three a second.
  let works = null;
  if (isPro) {
    const malWorks = await Promise.all(
      authors
        .flatMap((author) => (author.mal ? [author.mal.id] : []))
        .slice(0, 3)
        .map(getPersonManga),
    );
    const all = withMalWorks(authorWorks(media), malWorks.flat(), title.mal_media_id);
    const library =
      all.length === 0
        ? []
        : await getLibraryMatches(
            {
              anilistIds: all.flatMap((work) => (work.anilistId === null ? [] : [work.anilistId])),
              malIds: all.flatMap((work) => (work.malId === null ? [] : [work.malId])),
            },
            user.supabase,
          );
    works = relatedWorks(all, library, { hideMature: reader.hideMature }).map((work) => ({
      title: {
        key: `${work.malId ?? ""}:${work.anilistId ?? ""}`,
        source: work.malId !== null && work.anilistId !== null ? "both" : work.malId !== null ? "mal" : "anilist",
        mal_media_id: work.malId,
        anilist_media_id: work.anilistId,
        title: work.title,
        title_en: null,
        main_picture_url: work.cover,
        media_kind: null,
      },
      entryId: work.entryId,
    }));
  }
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
    posters: posterOptions({
      catalog: title.main_picture_url,
      current: entry.cover_url,
      myanimelist: mal?.pictures,
      anilist: [media?.coverImage?.extraLarge ?? media?.coverImage?.large],
      anilistBanner: media?.bannerImage,
    }).map((option) => ({ url: option.url, label: POSTER_SOURCE_LABELS[option.source] })),
    works,
    malLink: malLink && {
      found: malLink.found && {
        id: malLink.found.id,
        title: malLink.found.title,
        url: `https://myanimelist.net/manga/${malLink.found.id}`,
      },
      twin: malLink.twin && {
        entryId: malLink.twin.id,
        titleId: malLink.twin.titleId,
        title: malLink.twin.title,
      },
      editUrl: `https://anilist.co/edit/manga/${title.anilist_media_id}`,
      searchUrl: searchOtherSiteUrl({ onlyOn: "anilist", id: title.anilist_media_id!, title: title.title }),
    },
  });
}
