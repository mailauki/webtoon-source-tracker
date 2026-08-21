import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next 16 renamed the `middleware` convention to `proxy`.
 *
 * This deliberately does NOT create a Supabase client or call getUser().
 * Most Supabase tutorials do exactly that, but the Next docs are explicit that
 * proxy "is meant to be invoked separately of your render code... you should
 * not attempt relying on shared modules or globals" — and doing auth here
 * would fire a network request on every prefetch.
 *
 * So this is an *optimistic* check: it only asks whether a session cookie
 * exists, to avoid flashing a protected page before redirecting. It proves
 * nothing about validity. Real enforcement lives in `lib/auth/dal.ts`, which
 * verifies the JWT and runs on every protected page and server action.
 */

const PROTECTED_PREFIXES = ["/library", "/entry", "/settings"];
const AUTH_PAGES = ["/login", "/signup"];

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasSessionCookie(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
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
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   _next/static, _next/image  — build output
     *   favicon.ico, static assets — public files
     *   auth/, mal/                — OAuth callbacks must never be intercepted
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/|mal/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
