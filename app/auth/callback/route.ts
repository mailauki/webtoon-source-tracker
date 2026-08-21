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

  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Missing authorization code.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
