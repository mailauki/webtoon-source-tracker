import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth (Google / Discord) return point.
 *
 * Supabase redirects here with `?code=`; we exchange it for a session. The
 * cookies are written through the SSR client's setAll handler, which works
 * because Route Handlers can write cookies (Server Components cannot).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/library";

  // Only relative paths — otherwise `next` is an open redirect.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/library";

  // Linking an extra provider (`linkIdentity`) comes back through here too,
  // but the user is ALREADY signed in. Sending those failures to /login is
  // worse than useless: proxy.ts sees a valid session cookie, redirects
  // /login -> /library, and clears `url.search` on the way — so the error
  // message is silently discarded and the link appears to do nothing.
  // Link failures belong on /settings, where the button lives.
  const isLink = searchParams.get("linked") === "1";
  const errorPage = isLink ? "/settings" : "/login";
  const fail = (message: string) =>
    NextResponse.redirect(
      `${origin}${errorPage}?error=${encodeURIComponent(message)}`,
    );

  // Providers return `error=access_denied` when someone clicks Cancel on the
  // consent screen. That is a normal choice, not a fault, so say so plainly
  // rather than showing the raw OAuth code.
  const errorCode = searchParams.get("error");
  if (errorCode) {
    return fail(
      errorCode === "access_denied"
        ? isLink
          ? "Linking was cancelled. Nothing changed."
          : "Sign-in was cancelled."
        : (searchParams.get("error_description") ?? errorCode),
    );
  }

  if (!code) {
    return fail("Missing authorization code.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return fail(error.message);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
