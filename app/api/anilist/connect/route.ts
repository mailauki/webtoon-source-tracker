import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  APP_CALLBACK,
  APP_TICKET_COOKIE,
  appConnectUrl,
  linkUserId,
} from "@/lib/auth/app-link";
import { STATE_COOKIE, buildAuthorizeUrl } from "@/lib/anilist/oauth";
import { createState } from "@/lib/mal/oauth";

/**
 * Starts the AniList link flow.
 *
 * Linking, not signing in — the same arrangement as /api/mal/connect. There is
 * no PKCE verifier to stash (AniList's code grant does not use one), so the
 * state is the only cookie (plus the app's ticket, when the app started it).
 */
export async function POST(request: NextRequest) {
  return appConnectUrl(request, "/api/anilist/connect");
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

  const state = createState(userId);
  const response = NextResponse.redirect(buildAuthorizeUrl(state));

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax", not "strict": the callback arrives as a cross-site redirect from
    // anilist.co, and a strict cookie would not be sent with it.
    sameSite: "lax" as const,
    // Scoped to the callback's own path, so it rides only that request.
    path: "/api/anilist",
    maxAge: 600,
  };

  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  // Also cleared on a web start, so a ticket left by an abandoned app flow
  // cannot route this browser's callback to the app.
  if (ticket) response.cookies.set(APP_TICKET_COOKIE, ticket, cookieOptions);
  else response.cookies.delete({ name: APP_TICKET_COOKIE, path: cookieOptions.path });

  return response;
}
