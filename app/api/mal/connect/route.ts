import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  APP_CALLBACK,
  APP_TICKET_COOKIE,
  appConnectUrl,
  linkUserId,
} from "@/lib/auth/app-link";
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
 *
 * The iOS app POSTs here with its access token for a ticketed URL, then opens
 * that URL — see lib/auth/app-link.ts.
 */
export async function POST(request: NextRequest) {
  return appConnectUrl(request, "/api/mal/connect");
}

export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket");
  // Route handlers are reachable directly, so this check is load-bearing.
  const userId = await linkUserId(ticket);
  if (!userId) {
    return NextResponse.redirect(
      `${APP_CALLBACK}?error=${encodeURIComponent("The link request expired. Please try again.")}`,
    );
  }

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
  // Also cleared on a web start, so a ticket left by an abandoned app flow
  // cannot route this browser's callback to the app.
  if (ticket) response.cookies.set(APP_TICKET_COOKIE, ticket, cookieOptions);
  else response.cookies.delete({ name: APP_TICKET_COOKIE, path: cookieOptions.path });

  return response;
}
