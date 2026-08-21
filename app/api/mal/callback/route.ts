import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifySession } from "@/lib/auth/dal";
import {
  PKCE_COOKIE,
  STATE_COOKIE,
  exchangeCodeForTokens,
  verifyState,
} from "@/lib/mal/oauth";
import { saveTokens } from "@/lib/mal/token-store";
import { createAdminClient } from "@/lib/supabase/admin";

function fail(origin: string, reason: string) {
  return NextResponse.redirect(
    `${origin}/settings?error=${encodeURIComponent(reason)}`,
  );
}

export async function GET(request: NextRequest) {
  const { userId } = await verifySession();
  const { searchParams, origin } = request.nextUrl;

  const malError = searchParams.get("error");
  if (malError) {
    return fail(origin, `MyAnimeList returned an error: ${malError}`);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(PKCE_COOKIE)?.value;

  if (!code || !state || !cookieState || !codeVerifier) {
    return fail(origin, "The link request expired. Please try again.");
  }

  // Two checks, both needed: the state must match the cookie (CSRF), and its
  // signature must belong to THIS user — otherwise a callback captured from
  // another browser could be replayed to attach someone else's MAL account.
  if (state !== cookieState || !verifyState(state, userId)) {
    return fail(origin, "Security check failed. Please try again.");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, codeVerifier);
  } catch (cause) {
    return fail(origin, `Could not complete the link: ${(cause as Error).message}`);
  }

  // Identify the MAL account before storing anything.
  let malUser;
  try {
    // A throwaway client: tokens are not persisted yet, so fetch directly.
    const response = await fetch(
      "https://api.myanimelist.net/v2/users/@me?fields=id,name,picture",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`status ${response.status}`);
    malUser = (await response.json()) as {
      id: number;
      name: string;
      picture?: string;
    };
  } catch (cause) {
    return fail(origin, `Could not read your MyAnimeList profile: ${(cause as Error).message}`);
  }

  const admin = createAdminClient();

  // One MAL account maps to exactly one app account. Check explicitly so the
  // user gets a clear message instead of a raw unique-constraint error.
  const { data: existing } = await admin
    .from("mal_connections")
    .select("user_id")
    .eq("mal_user_id", malUser.id)
    .maybeSingle();

  if (existing && existing.user_id !== userId) {
    return fail(
      origin,
      "That MyAnimeList account is already connected to another account.",
    );
  }

  const { error: upsertError } = await admin.from("mal_connections").upsert(
    {
      user_id: userId,
      mal_user_id: malUser.id,
      mal_username: malUser.name,
      mal_picture_url: malUser.picture ?? null,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    return fail(origin, `Could not save the connection: ${upsertError.message}`);
  }

  // Tokens last: the FK requires the mal_connections row to exist first.
  try {
    await saveTokens(userId, tokens);
  } catch (cause) {
    return fail(origin, `Could not store credentials: ${(cause as Error).message}`);
  }

  const response = NextResponse.redirect(`${origin}/library?connected=1`);
  response.cookies.delete(PKCE_COOKIE);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
