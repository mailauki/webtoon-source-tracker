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
  //
  // Session cookies are `sb-<ref>-auth-token`, optionally chunked `.0`/`.1`.
  // But an in-flight PKCE flow (OAuth sign-in, and `linkIdentity`) also stores
  // its verifier under that same prefix:
  //
  //   sb-<ref>-auth-token-flow-<id>-code-verifier
  //   sb-<ref>-auth-token-flows-code-verifier
  //
  // Deleting those strands the flow: the provider sends the user back with a
  // code, `exchangeCodeForSession` finds no verifier, and the callback errors
  // straight back here — a loop that looks like "stuck on the signed-out
  // page". Keep them; they are short-lived and scoped to the flow.
  for (const cookie of request.cookies.getAll()) {
    const isSupabaseAuth =
      cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token");
    const isPkceVerifier = cookie.name.endsWith("-code-verifier");

    if (isSupabaseAuth && !isPkceVerifier) {
      response.cookies.delete(cookie.name);
    }
  }

  return response;
}
