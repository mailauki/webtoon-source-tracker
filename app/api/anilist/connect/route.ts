import { NextResponse } from "next/server";

import { createAppState, userClientFromBearer } from "@/lib/auth/app-link";
import { verifySession } from "@/lib/auth/dal";
import { canLinkService } from "@/lib/data/pro";
import { PRO_MESSAGES } from "@/lib/pro";
import { STATE_COOKIE, buildAuthorizeUrl } from "@/lib/anilist/oauth";
import { createState } from "@/lib/mal/oauth";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts the AniList link flow.
 *
 * Linking, not signing in — the same arrangement as /api/mal/connect. There is
 * no PKCE verifier to stash (AniList's code grant does not use one), so the
 * state is the only cookie.
 */
export async function GET(request: Request) {
  // Route handlers are reachable directly, so this check is load-bearing.
  const { userId } = await verifySession();

  if (!(await canLinkService(await createClient(), userId, "anilist"))) {
    return NextResponse.redirect(new URL("/pro?need=sync", request.url));
  }

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

/** Leg 1 of an app link — see lib/auth/app-link.ts. */
export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!(await canLinkService(user.supabase, user.userId, "anilist"))) {
    return Response.json({ error: PRO_MESSAGES.sync }, { status: 402 });
  }

  return Response.json({ url: buildAuthorizeUrl(createAppState(user.userId)) });
}
