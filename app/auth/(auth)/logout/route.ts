import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * POST only — a GET logout can be triggered by a prefetch or an <img> tag,
 * which would sign people out unexpectedly.
 *
 * The MAL connection and its tokens are intentionally left intact so the next
 * sign-in does not require re-consenting to MyAnimeList. Removing those is a
 * separate, explicit "Disconnect MyAnimeList" action in settings.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/auth/login", request.nextUrl.origin), {
    status: 303, // force the redirect to be followed as GET
  });
}
