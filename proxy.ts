import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next 16 renamed the `middleware` convention to `proxy`.
 *
 * The redirects here are *optimistic*: they only ask whether a session cookie
 * exists, to avoid flashing a protected page before redirecting. They prove
 * nothing about validity. Real enforcement lives in `lib/auth/dal.ts`, which
 * verifies the JWT and runs on every protected page and server action.
 *
 * What this does do with Supabase is keep the session fresh. Server Components
 * cannot write cookies, so without this an expired access token was refreshed
 * separately by every Supabase client a page created — and refresh tokens are
 * single-use, so all but the first came back with no session. RLS then
 * returned nothing, which read as "not Pro" or a stale shelf until a reload.
 * Refreshing once here, before the render, and writing the new cookies onto
 * both the request and the response means every client in the render sees
 * the same valid token (see @supabase/ssr's README, "Concurrent requests").
 *
 * Cheap on prefetches: the project signs JWTs with ES256, so getClaims()
 * verifies locally and only reaches the network when the token has expired.
 */

const PROTECTED_PREFIXES = [
  "/library",
  "/entry",
  "/settings",
  "/discover",
  "/admin",
  "/pro",
];
const AUTH_PAGES = ["/auth/login", "/auth/signup"];

function hasSessionCookie(request: NextRequest): boolean {
  // @supabase/ssr names cookies `sb-<project-ref>-auth-token`, and chunks
  // large ones with a `.0` / `.1` suffix — so match on the prefix.
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        cookie.name.includes("-auth-token") &&
        cookie.value.length > 0,
    );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasSessionCookie(request);
  let response = NextResponse.next({ request });

  if (signedIn) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    // Refreshes the session if it has expired; the result is not used here.
    await supabase.auth.getClaims();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    // Preserve where they were headed so login can send them back.
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Signed-in users have no reason to see login/signup — but this must NOT
  // fire when the DAL just bounced them here, or we get an infinite loop:
  // proxy sees a (possibly invalid) cookie -> /library -> DAL rejects it ->
  // /login -> proxy sees the cookie again -> ...
  //
  // A forged or expired cookie still looks "signed in" to this cheap check,
  // so the DAL appends ?signedout=1 when it rejects a session. That marker is
  // the signal to leave the user on /login and let them sign in again.
  if (AUTH_PAGES.includes(pathname) && signedIn) {
    const bouncedByDal = request.nextUrl.searchParams.has("signedout");

    if (!bouncedByDal) {
      const url = request.nextUrl.clone();
      url.pathname = "/library";
      url.search = "";
      // Carry any refreshed session cookies across the redirect.
      const redirect = NextResponse.redirect(url);
      for (const cookie of response.cookies.getAll()) {
        redirect.cookies.set(cookie);
      }
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   _next/static, _next/image  — build output
     *   favicon.ico, static assets — public files
     *   api/                       — route handlers, incl. the MAL OAuth
     *                                  callbacks
     *   auth/callback, auth/confirm,
     *   auth/logout, auth/clear-session
     *                              — Supabase route handlers. Excluded by
     *                                exact name, NOT the whole `auth/` prefix:
     *                                the sign-in *pages* now live under
     *                                /auth/login and /auth/signup, and those
     *                                still need the signed-in redirect above.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/|auth/(?:callback|confirm|logout|clear-session)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
