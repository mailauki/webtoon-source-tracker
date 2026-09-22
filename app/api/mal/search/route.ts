import { NextResponse } from "next/server";

import { getOptionalSession, isAgeConfirmedAdult } from "@/lib/auth/dal";
import {
  MIN_QUERY_LENGTH,
  matchesMediaKind,
  resolveMediaKind,
} from "@/lib/data/search";
import { MalClient } from "@/lib/mal/client";
import { searchManga } from "@/lib/mal/endpoints";
import { MalApiError, MalAuthError, MalRateLimitError } from "@/lib/mal/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Searches the MyAnimeList catalog for titles to add.
 *
 * A Route Handler rather than a Server Action, deliberately. This is a read,
 * and Next dispatches Server Actions one at a time per client — a
 * search-as-you-type box built on an action would queue every keystroke behind
 * the previous one, so a slow request would stall the ones after it. Route
 * handlers have no such serialization, and `AbortController` on the client can
 * cancel a superseded request outright.
 *
 * Titles the user already has are dropped from the response outright. The
 * search page shows their own shelf directly above these results, so listing
 * them again here just pads the catalog with rows that have no action on them.
 *
 * Two switches from the page ride along as query params:
 *
 *   `nsfw=1`  — ask MAL for adult titles too. Off unless asked for; see
 *               searchManga, which filters in two layers.
 *   `kind=`   — which side of the novels/webtoons switch to answer with.
 *
 * MAL's search takes no media_type filter, so `kind` is applied here, after
 * the fetch. That is why FETCH_LIMIT is well above LIMIT: a page of 12 asked
 * of a catalog that is mostly manga would come back with one or two novels on
 * it, and the switch would look broken rather than selective. Over-fetching
 * once per search is the cheaper half of that trade — the alternative is
 * paging MAL until the panel fills, which spends several requests on a search
 * the user may already have what they wanted from.
 */

const LIMIT = 24;

/**
 * How many rows to ask MAL for before filtering.
 *
 * Both filters below only ever remove rows — the kind switch drops one half of
 * the catalog, and owned titles go too — so this has to be a good multiple of
 * LIMIT for a full page to be reachable. MAL caps `limit` at 100.
 */
const FETCH_LIMIT = 60;

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
  // Anything but an explicit "1" is off: this is the direction where a
  // misread param should fail safe.
  const askedForMature = params.get("nsfw") === "1";

  // The age floor, enforced here rather than only on the switch that sets the
  // param. This handler is reachable directly — `nsfw=1` is one curl away —
  // so a disabled control in the UI is not a check, and the same reasoning
  // that put the floor in hidesMatureTitles() rather than in the settings
  // form applies to the one surface that reaches past our own catalog.
  //
  // Without this, the gate leaked in the one direction that matters most: the
  // catalog reads hide adult titles the app already stores, while this asks
  // MyAnimeList for new ones and would hand them to an account that has never
  // said it is old enough to see them.
  const includeMature = askedForMature && (await isAgeConfirmedAdult());
  // Unrecognised values resolve to the default side rather than 400ing — a
  // stale client asking for a side this version dropped should still search.
  const kind = resolveMediaKind(params.get("kind"));

  // Not an error — the field is simply not ready to search yet.
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] });
  }

  let found;
  try {
    const client = new MalClient(session.userId);
    found = await searchManga(client, query, FETCH_LIMIT, { includeMature });
  } catch (cause) {
    if (cause instanceof MalAuthError) {
      return NextResponse.json(
        { error: "Your MyAnimeList connection expired.", needsReauth: true },
        { status: 401 },
      );
    }
    if (cause instanceof MalRateLimitError) {
      return NextResponse.json(
        { error: "MyAnimeList is rate limiting us. Try again shortly." },
        { status: 429 },
      );
    }
    // MAL returns 400 for queries it dislikes (too short, bad characters).
    // Surface it as an empty result rather than an error the user can't act on.
    if (cause instanceof MalApiError && cause.status === 400) {
      return NextResponse.json({ results: [] });
    }

    // Anything left is ours, not MyAnimeList's — a missing env var, a failed
    // token read, a Supabase outage. Log it: the message never reaches the
    // browser, so without this the only symptom is a generic error in the UI.
    console.error("[mal/search] failed:", cause);

    // A MalApiError means we genuinely reached MAL and it refused. Anything
    // else failed before the request went out, and blaming MAL for that sends
    // whoever debugs it looking in the wrong place.
    if (cause instanceof MalApiError) {
      return NextResponse.json(
        { error: "MyAnimeList returned an error." },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Search is misconfigured on the server." },
      { status: 500 },
    );
  }

  // The switch first, so the owned lookup below only asks about rows that
  // could still be shown.
  const candidates = found.data
    .map((item) => item.node)
    .filter((node) => matchesMediaKind(node.media_type, kind));

  // Which of these the user already has. RLS scopes this to the caller, so a
  // hit really is *their* entry.
  const owned = new Set<number>();
  if (candidates.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_entries")
      .select("media_titles!inner (mal_media_id)")
      .in(
        "media_titles.mal_media_id",
        candidates.map((n) => n.id),
      );

    for (const row of data ?? []) {
      const title = row.media_titles as unknown as { mal_media_id: number };
      if (title) owned.add(title.mal_media_id);
    }
  }

  // Dropped rather than flagged: everything left is something the user can
  // actually add.
  const nodes = candidates
    .filter((node) => !owned.has(node.id))
    .slice(0, LIMIT);

  return NextResponse.json({
    results: nodes.map((node) => ({
      mal_media_id: node.id,
      title: node.title,
      title_en: node.alternative_titles?.en || null,
      main_picture_url:
        node.main_picture?.large ?? node.main_picture?.medium ?? null,
      media_kind: node.media_type ?? null,
      num_chapters: node.num_chapters ?? null,
      num_volumes: node.num_volumes ?? null,
      mal_status: node.status ?? null,
    })),
  });
}
