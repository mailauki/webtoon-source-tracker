import { NextResponse } from "next/server";

import { appCodeVerifier, createAppState, userIdFromBearer } from "@/lib/auth/app-link";
import { verifySession } from "@/lib/auth/dal";
import {
  MAL_COOKIE_PATH,
  PKCE_COOKIE,
  STATE_COOKIE,
  buildAuthorizeUrl,
  createCodeVerifier,
  createState,
} from "@/lib/mal/oauth";

/**
 * Starts the MyAnimeList link flow.
 *
 * This is linking, not signing in: the user must already have an account, and
 * the resulting connection is attached to it.
 */
export async function GET() {
  // Route handlers are reachable directly, so this check is load-bearing.
  const { userId } = await verifySession();

  const codeVerifier = createCodeVerifier();
  const state = createState(userId);

  const response = NextResponse.redirect(
    buildAuthorizeUrl(codeVerifier, state),
  );

  const secure = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure,
    // Must be "lax", not "strict": a strict cookie is not sent on the
    // cross-site redirect back from myanimelist.net, so the callback would
    // find no verifier and every link attempt would fail.
    sameSite: "lax" as const,
    // Must cover the callback's URL, or the browser never sends these back
    // to it. This was "/mal" until the handlers moved under /api, after which
    // every callback found no verifier and failed as "link request expired".
    path: MAL_COOKIE_PATH,
    maxAge: 600,
  };

  response.cookies.set(PKCE_COOKIE, codeVerifier, cookieOptions);
  response.cookies.set(STATE_COOKIE, state, cookieOptions);

  return response;
}

/**
 * Leg 1 of an app link (see lib/auth/app-link.ts): the iOS app sends its
 * access token and gets the authorize URL to open itself. No cookies — the
 * PKCE verifier is derived from the state when the app finishes the link.
 */
export async function POST(request: Request) {
  const userId = await userIdFromBearer(request);
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const state = createAppState(userId);
  return Response.json({ url: buildAuthorizeUrl(appCodeVerifier(state), state) });
}
