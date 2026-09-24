import { NextResponse } from "next/server";

import { AniListRateLimitError } from "@/lib/anilist/errors";
import { toMalMediaKind } from "@/lib/anilist/mapping";
import {
  isAniListNovel,
  searchManga as searchAniList,
} from "@/lib/anilist/endpoints";
import { getOptionalSession, isAgeConfirmedAdult } from "@/lib/auth/dal";
import {
  mergeResults,
  type AniListHit,
  type MalHit,
} from "@/lib/data/cross-search";
import {
  MIN_QUERY_LENGTH,
  matchesMediaKind,
  resolveMediaKind,
  type MediaKind,
} from "@/lib/data/search";
import { MalClient } from "@/lib/mal/client";
import { searchManga as searchMal } from "@/lib/mal/endpoints";
import { MalApiError, MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Searches both catalogs at once and merges the answers.
 *
 * Replaces /api/mal/search, which asked MyAnimeList alone. The reasoning for a
 * Route Handler over a Server Action is unchanged and still load-bearing: this
 * is a read behind a search-as-you-type box, Next dispatches Server Actions one
 * at a time per client, and an AbortController on the client can cancel a
 * superseded request outright.
 *
 * Neither half needs the user to have connected anything. AniList serves
 * catalog reads anonymously, and the MyAnimeList half falls back to the app's
 * own client id when there is no token to use — see malPublicRequest. A
 * connected MAL account is still preferred where one exists, since that is the
 * path already exercised by the rest of the app.
 *
 * The two sites are asked in parallel and one failing does not fail the
 * request: a search that can only answer from one catalog is far more useful
 * than an error, and the response says which half is missing so the page can
 * admit it rather than quietly showing less.
 */

const LIMIT = 24;

/**
 * How many rows to ask each site for before filtering.
 *
 * Every filter below only ever removes rows — the kind switch drops one half
 * of the catalog, owned titles go too — so this has to be a good multiple of
 * LIMIT for a full page to be reachable. MAL caps `limit` at 100; AniList's
 * perPage caps at 50.
 */
const FETCH_LIMIT = 60;
const ANILIST_FETCH_LIMIT = 50;

export async function GET(request: Request) {
  // Route handlers are reachable directly, so this check is load-bearing.
  // getOptionalSession, not verifySession: an expired cookie should read as
  // 401 JSON to a fetch() caller, not a redirect to /auth/clear-session.
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  // Anything but an explicit "1" is off: this is the direction where a misread
  // param should fail safe.
  const askedForMature = params.get("nsfw") === "1";

  // The age floor, enforced here rather than only on the switch that sets the
  // param. This handler is reachable directly — `nsfw=1` is one curl away — so
  // a disabled control in the UI is not a check. Applies to both catalogs:
  // adding a second source of adult titles must not open a second way around
  // the gate.
  const includeMature = askedForMature && (await isAgeConfirmedAdult());
  // Unrecognised values resolve to the default side rather than 400ing — a
  // stale client asking for a side this version dropped should still search.
  const kind = resolveMediaKind(params.get("kind"));

  // Not an error — the field is simply not ready to search yet.
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] });
  }

  const [malOutcome, anilistOutcome] = await Promise.all([
    fetchMal(session.userId, query, kind, includeMature),
    fetchAniList(query, kind, includeMature),
  ]);

  // Both down is a real failure; one down is a partial answer. MAL's error
  // wins the message because its half is the one that can be added from.
  if (malOutcome.error && anilistOutcome.error) {
    return NextResponse.json(
      { error: malOutcome.error.message },
      { status: malOutcome.error.status },
    );
  }

  const owned = await ownedMalIds(malOutcome.hits, anilistOutcome.hits);

  const merged = mergeResults(malOutcome.hits, anilistOutcome.hits)
    // Dropped rather than flagged: everything left is something the user can
    // actually act on. A row matched only on AniList still counts as owned
    // when AniList gave it a MAL id the library already holds.
    .filter((row) => row.mal_media_id === null || !owned.has(row.mal_media_id))
    .slice(0, LIMIT);

  return NextResponse.json({
    results: merged,
    // Named so the page can say which catalog is missing instead of showing a
    // short list with no explanation.
    unavailable: [
      ...(malOutcome.error ? ["mal"] : []),
      ...(anilistOutcome.error ? ["anilist"] : []),
    ],
    // Only meaningful when "mal" is unavailable: it separates "reconnect your
    // account" from "MyAnimeList is down".
    needsReauth: malOutcome.error?.needsReauth ?? false,
  });
}

type Failure = { message: string; status: number; needsReauth?: boolean };

/**
 * The MyAnimeList half.
 *
 * A connected account searches with its own token; anything else falls back to
 * the app's client id. An expired connection is NOT a failure here — it falls
 * back too, so a stale token degrades search to the public path rather than
 * emptying half the page.
 */
async function fetchMal(
  userId: string,
  query: string,
  kind: MediaKind,
  includeMature: boolean,
): Promise<{ hits: MalHit[]; error?: Failure }> {
  const attempt = async (client: MalClient | null) => {
    const found = await searchMal(client, query, FETCH_LIMIT, {
      includeMature,
    });
    return found.data
      .map((item) => item.node)
      .filter((node) => matchesMediaKind(node.media_type, kind))
      .map((node): MalHit => ({
        mal_media_id: node.id,
        title: node.title,
        title_en: node.alternative_titles?.en || null,
        main_picture_url:
          node.main_picture?.large ?? node.main_picture?.medium ?? null,
        media_kind: node.media_type ?? null,
        num_chapters: node.num_chapters ?? null,
        num_volumes: node.num_volumes ?? null,
        mal_status: node.status ?? null,
      }));
  };

  try {
    return { hits: await attempt(new MalClient(userId)) };
  } catch (cause) {
    // The user's token is gone or dead. The public path needs no token, so
    // retry there before giving up — the only thing lost is nothing.
    if (cause instanceof MalAuthError) {
      try {
        return { hits: await attempt(null) };
      } catch (fallbackCause) {
        return { hits: [], error: describeMalFailure(fallbackCause) };
      }
    }
    return { hits: [], error: describeMalFailure(cause) };
  }
}

function describeMalFailure(cause: unknown): Failure {
  if (cause instanceof MalAuthError) {
    return {
      message: "Your MyAnimeList connection expired.",
      status: 401,
      needsReauth: true,
    };
  }
  if (cause instanceof MalRateLimitError) {
    return {
      message: "MyAnimeList is rate limiting us. Try again shortly.",
      status: 429,
    };
  }
  // MAL returns 400 for queries it dislikes (too short, bad characters). Not
  // an error the user can act on — an empty MAL half is the honest answer.
  if (cause instanceof MalApiError && cause.status === 400) {
    return { message: "", status: 200 };
  }

  // Anything left is ours, not MyAnimeList's — a missing env var, a failed
  // token read, a Supabase outage. Log it: the message never reaches the
  // browser, so without this the only symptom is a generic error in the UI.
  console.error("[catalog/search] MyAnimeList failed:", cause);

  // A MalApiError means we genuinely reached MAL and it refused. Anything else
  // failed before the request went out, and blaming MAL for that sends whoever
  // debugs it looking in the wrong place.
  return cause instanceof MalApiError
    ? { message: "MyAnimeList returned an error.", status: 502 }
    : { message: "Search is misconfigured on the server.", status: 500 };
}

/** The AniList half. Always anonymous — no connection is consulted at all. */
async function fetchAniList(
  query: string,
  kind: MediaKind,
  includeMature: boolean,
): Promise<{ hits: AniListHit[]; error?: Failure }> {
  try {
    const media = await searchAniList(query, ANILIST_FETCH_LIMIT, {
      includeMature,
    });

    const hits = media
      // The same switch as the MAL half, against AniList's own vocabulary.
      .filter((item) =>
        kind === "novels"
          ? isAniListNovel(item.format)
          : !isAniListNovel(item.format),
      )
      .map((item): AniListHit => ({
        anilist_media_id: item.id,
        mal_media_id: item.idMal,
        // AniList has no single canonical title. Romaji matches what MAL
        // calls `title`, which keeps the two halves reading alike.
        title: item.title.romaji ?? item.title.english ?? "Untitled",
        title_en: item.title.english,
        main_picture_url:
          item.coverImage?.large ?? item.coverImage?.medium ?? null,
        // MAL's vocabulary, so a hit reads "manhwa" in either half.
        media_kind: toMalMediaKind(item.format, item.countryOfOrigin),
        num_chapters: item.chapters,
        num_volumes: item.volumes,
        anilist_status: item.status,
      }));

    return { hits };
  } catch (cause) {
    if (cause instanceof AniListRateLimitError) {
      return {
        hits: [],
        error: {
          message: "AniList is rate limiting us. Try again shortly.",
          status: 429,
        },
      };
    }
    console.error("[catalog/search] AniList failed:", cause);
    return {
      hits: [],
      error: { message: "AniList returned an error.", status: 502 },
    };
  }
}

/**
 * Which of these titles the user already has.
 *
 * RLS scopes this to the caller, so a hit really is *their* entry. Both sides
 * contribute ids: an AniList-matched row carries a MAL id too, and missing it
 * would offer to add a title that is already on the shelf above.
 */
async function ownedMalIds(
  malHits: MalHit[],
  anilistHits: AniListHit[],
): Promise<Set<number>> {
  const ids = [
    ...malHits.map((h) => h.mal_media_id),
    ...anilistHits.flatMap((h) =>
      h.mal_media_id === null ? [] : [h.mal_media_id],
    ),
  ];

  const owned = new Set<number>();
  if (ids.length === 0) return owned;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_entries")
    .select("media_titles!inner (mal_media_id)")
    .in("media_titles.mal_media_id", [...new Set(ids)]);

  for (const row of data ?? []) {
    const title = row.media_titles as unknown as { mal_media_id: number };
    if (title) owned.add(title.mal_media_id);
  }

  return owned;
}
