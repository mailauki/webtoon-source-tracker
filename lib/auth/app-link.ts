import "server-only";

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { createState, verifyState } from "@/lib/mal/oauth";

/**
 * MAL/AniList linking from the iOS app.
 *
 * The web flow identifies the user by session cookie, which the app's
 * ASWebAuthenticationSession does not have. So an app link runs in three
 * legs, and the browser never completes one:
 *
 *   1. The app POSTs /api/<provider>/connect with its Supabase access token
 *      and gets back the provider's authorize URL, with a state bound to that
 *      user and marked as an app state.
 *   2. The provider redirects to our callback, which sees the app state and
 *      only forwards `code` and `state` to webtoonsourcetracker://linked.
 *   3. The app POSTs them to /api/<provider>/callback with its access token.
 *      The link is made only if that token's user is the one the state was
 *      issued for.
 *
 * Leg 3 is what makes this safe. A browser-only design (a "ticket" in the
 * URL) let an attacker send someone a link carrying the attacker's own
 * ticket, attaching the victim's MAL account to the attacker's app account.
 * Here the victim's browser can only hand the code to the victim's own app,
 * whose token does not match the attacker's state.
 */

/** Where the app's ASWebAuthenticationSession listens. */
export const APP_CALLBACK = "webtoonsourcetracker://linked";
const APP_STATE_PREFIX = "app.";

export function createAppState(userId: string): string {
  return `${APP_STATE_PREFIX}${createState(userId)}`;
}

export function isAppState(state: string | null): state is string {
  return state?.startsWith(APP_STATE_PREFIX) ?? false;
}

export function verifyAppState(state: string, userId: string): boolean {
  return isAppState(state) && verifyState(state.slice(APP_STATE_PREFIX.length), userId);
}

/**
 * MAL's PKCE verifier for an app state. The web flow keeps its verifier in a
 * cookie, but leg 3 is a plain request from the app, so the verifier is
 * derived from the state with the server secret instead: 43 base64url chars,
 * inside MAL's 43–128 range, and unguessable without the secret.
 */
export function appCodeVerifier(state: string): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createHmac("sha256", secret).update(`app-pkce:${state}`).digest("base64url");
}

/** Leg 2: hand the provider's answer to the app, untouched. */
export function redirectToApp(searchParams: URLSearchParams): Response {
  const forward = new URLSearchParams();
  for (const key of ["code", "state", "error"]) {
    const value = searchParams.get(key);
    if (value) forward.set(key, value);
  }
  return Response.redirect(`${APP_CALLBACK}?${forward}`, 302);
}

/** Verifies an `Authorization: Bearer <supabase access token>` header. */
export async function userIdFromBearer(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  const { data, error } = await supabase.auth.getClaims(token);
  return error ? null : (data?.claims?.sub ?? null);
}

/**
 * Leg 3's checks: returns the user and the provider's code, or a JSON error
 * response to send back as-is.
 */
export async function readAppCallback(
  request: Request,
): Promise<{ userId: string; code: string; state: string } | Response> {
  const userId = await userIdFromBearer(request);
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { code?: unknown; state?: unknown }
    | null;
  const code = typeof body?.code === "string" ? body.code : null;
  const state = typeof body?.state === "string" ? body.state : null;

  if (!code || !state || !verifyAppState(state, userId)) {
    return Response.json(
      { error: "Security check failed. Please try again." },
      { status: 403 },
    );
  }
  return { userId, code, state };
}
