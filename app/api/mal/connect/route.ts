import { NextResponse } from "next/server";

import { verifySession } from "@/lib/auth/dal";
import {
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
    path: "/mal",
    maxAge: 600,
  };

  response.cookies.set(PKCE_COOKIE, codeVerifier, cookieOptions);
  response.cookies.set(STATE_COOKIE, state, cookieOptions);

  return response;
}
