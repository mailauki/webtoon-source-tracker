import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Email link handler — signup confirmation and password recovery.
 *
 * Takes either link shape: `?token_hash=&type=` from a template built on
 * {{ .TokenHash }}, or `?code=` when the template uses the default
 * {{ .ConfirmationURL }} (Supabase verifies the email, then redirects here
 * with a PKCE code). The code only exchanges in the browser that asked for
 * the email, since that is where the PKCE verifier cookie lives.
 *
 * Confirmation matters beyond "is this address real": Supabase only
 * auto-links a new OAuth identity to an existing account when the email is
 * VERIFIED. Without it, signing up by email and later with Google on the same
 * address would produce two separate accounts.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/library";

  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/library";

  // /auth/login, not /login — a bare /login 404s.
  const fail = (message: string) =>
    NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(message)}`,
    );

  // An expired or reused {{ .ConfirmationURL }} arrives with these instead.
  const linkError = searchParams.get("error_description");
  if (linkError) return fail(linkError);

  const supabase = await createClient();
  let error;
  if (token_hash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash, type }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    return fail("Invalid or expired link.");
  }

  if (error) return fail(error.message);

  return NextResponse.redirect(`${origin}${next}`);
}
