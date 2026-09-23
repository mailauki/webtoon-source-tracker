import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { anilistRequest } from "@/lib/anilist/client";
import { VIEWER_QUERY } from "@/lib/anilist/endpoints";
import { STATE_COOKIE, exchangeCodeForToken } from "@/lib/anilist/oauth";
import { saveToken } from "@/lib/anilist/token-store";
import { anilistViewerSchema } from "@/lib/anilist/types";
import { verifySession } from "@/lib/auth/dal";
import { verifyState } from "@/lib/mal/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

function fail(origin: string, reason: string) {
  const response = NextResponse.redirect(
    `${origin}/settings?error=${encodeURIComponent(reason)}`,
  );
  response.cookies.delete({ name: STATE_COOKIE, path: "/api/anilist" });
  return response;
}

export async function GET(request: NextRequest) {
  const { userId } = await verifySession();
  const { searchParams, origin } = request.nextUrl;

  const anilistError = searchParams.get("error");
  if (anilistError) {
    return fail(origin, `AniList returned an error: ${anilistError}`);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieState) {
    return fail(origin, "The link request expired. Please try again.");
  }

  // Both checks, as in the MAL callback: the state must match the cookie
  // (CSRF), and its signature must belong to THIS user, so a callback
  // captured elsewhere cannot attach someone else's AniList account.
  if (state !== cookieState || !verifyState(state, userId)) {
    return fail(origin, "Security check failed. Please try again.");
  }

  let token;
  try {
    token = await exchangeCodeForToken(code);
  } catch (cause) {
    return fail(origin, `Could not complete the link: ${(cause as Error).message}`);
  }

  // Identify the AniList account before storing anything.
  let viewer;
  try {
    const raw = await anilistRequest<{ Viewer: unknown }>(
      token.access_token,
      VIEWER_QUERY,
    );
    viewer = anilistViewerSchema.parse(raw.Viewer);
  } catch (cause) {
    return fail(origin, `Could not read your AniList profile: ${(cause as Error).message}`);
  }

  const admin = createAdminClient();

  // One AniList account maps to exactly one app account.
  const { data: existing } = await admin
    .from("anilist_connections")
    .select("user_id")
    .eq("anilist_user_id", viewer.id)
    .maybeSingle();

  if (existing && existing.user_id !== userId) {
    return fail(origin, "That AniList account is already connected to another account.");
  }

  const { error: upsertError } = await admin.from("anilist_connections").upsert(
    {
      user_id: userId,
      anilist_user_id: viewer.id,
      anilist_username: viewer.name,
      anilist_avatar_url: viewer.avatar?.medium ?? null,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    return fail(origin, `Could not save the connection: ${upsertError.message}`);
  }

  // Token last: the FK requires the anilist_connections row to exist first.
  try {
    await saveToken(userId, token);
  } catch (cause) {
    return fail(origin, `Could not store credentials: ${(cause as Error).message}`);
  }

  const response = NextResponse.redirect(`${origin}/settings?anilist=connected`);
  response.cookies.delete({ name: STATE_COOKIE, path: "/api/anilist" });
  return response;
}
