import { NextResponse } from "next/server";

import { verifySession } from "@/lib/auth/dal";
import { STATE_COOKIE, buildAuthorizeUrl } from "@/lib/anilist/oauth";
import { createState } from "@/lib/mal/oauth";

/**
 * Starts the AniList link flow.
 *
 * Linking, not signing in — the same arrangement as /api/mal/connect. There is
 * no PKCE verifier to stash (AniList's code grant does not use one), so the
 * state is the only cookie.
 */
export async function GET() {
  // Route handlers are reachable directly, so this check is load-bearing.
  const { userId } = await verifySession();

  const state = createState(userId);
  const response = NextResponse.redirect(buildAuthorizeUrl(state));

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax", not "strict": the callback arrives as a cross-site redirect from
    // anilist.co, and a strict cookie would not be sent with it.
    sameSite: "lax",
    // Scoped to the callback's own path, so it rides only that request.
    path: "/api/anilist",
    maxAge: 600,
  });

  return response;
}
