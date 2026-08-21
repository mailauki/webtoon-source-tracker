import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Email link handler — signup confirmation and password recovery.
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
  const rawNext = searchParams.get("next") ?? "/library";

  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/library";

  if (!token_hash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Invalid or expired link.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
