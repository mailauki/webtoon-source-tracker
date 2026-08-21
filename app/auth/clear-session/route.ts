import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Clears a session cookie the DAL rejected, then sends the user to /login.
 *
 * This has to be a Route Handler: Server Components cannot write cookies, and
 * calling a server action during render does not lift that restriction (the
 * limit is on the rendering context, not the function).
 *
 * Without this, a forged or expired cookie survives — proxy.ts keeps seeing a
 * "signed in" visitor and bounces them between /login and the protected page.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Handles the normal expired-session case.
  await supabase.auth.signOut();

  const response = NextResponse.redirect(
    new URL("/login?signedout=1", request.nextUrl.origin),
  );

  // signOut() is a no-op when the cookie is malformed rather than merely
  // expired (there is no session to end), so delete the cookies outright.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
      response.cookies.delete(cookie.name);
    }
  }

  return response;
}
