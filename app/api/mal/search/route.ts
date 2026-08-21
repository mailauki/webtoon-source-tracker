import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/dal";
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
 * Results are annotated with `in_library`, so the UI can show "Added" instead
 * of an add button for titles the user already has.
 */

/** MAL's own minimum; shorter queries return noise. */
const MIN_QUERY_LENGTH = 3;
const LIMIT = 12;

export async function GET(request: Request) {
  // Route handlers are reachable directly, so this check is load-bearing.
  // getOptionalSession, not verifySession: an expired cookie should read as
  // 401 JSON to a fetch() caller, not a redirect to /auth/clear-session.
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  // Not an error — the field is simply not ready to search yet.
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] });
  }

  let found;
  try {
    const client = new MalClient(session.userId);
    found = await searchManga(client, query, LIMIT);
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

  const nodes = found.data.map((item) => item.node);

  // Flag the ones already in the library so the UI never offers to add a
  // duplicate. RLS scopes this to the caller, so a hit really is *their* entry.
  const owned = new Set<number>();
  if (nodes.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_entries")
      .select("media_titles!inner (mal_media_id)")
      .in(
        "media_titles.mal_media_id",
        nodes.map((n) => n.id),
      );

    for (const row of data ?? []) {
      const title = row.media_titles as unknown as { mal_media_id: number };
      if (title) owned.add(title.mal_media_id);
    }
  }

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
      in_library: owned.has(node.id),
    })),
  });
}
