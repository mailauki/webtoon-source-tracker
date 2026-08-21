import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type MalConnection =
  Database["public"]["Tables"]["mal_connections"]["Row"];

/**
 * Data Access Layer.
 *
 * `proxy.ts` only checks whether a session cookie is *present* — it is an
 * optimistic UX redirect and proves nothing. This module is the real
 * enforcement, and must be called from:
 *   - the authed layout
 *   - every protected page
 *   - the top of EVERY server action
 *
 * That last one is not optional: server actions are independently reachable
 * HTTP endpoints, so a check in the layout does not protect them.
 *
 * Each function is wrapped in React's `cache()`, so multiple calls within one
 * render pass share a single result.
 */

/**
 * Returns the current user's id, or redirects to /login.
 *
 * Uses `getClaims()`, which verifies the JWT signature locally (fast, and it
 * does not trust the cookie blindly). Never use `getSession()` in server code:
 * it does not revalidate the token.
 */
export const verifySession = cache(async (): Promise<{ userId: string }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  const userId = data?.claims?.sub;
  if (error || !userId) {
    // Route through /auth/clear-session rather than straight to /login: the
    // rejected cookie still exists in the browser, and only a Route Handler
    // can delete it. Landing on /login directly would leave the stale cookie
    // in place, and proxy.ts would keep treating the visitor as signed in.
    redirect("/auth/clear-session");
  }

  return { userId };
});

/** Current user id, or null. Does not redirect — for optional-auth surfaces. */
export const getOptionalSession = cache(
  async (): Promise<{ userId: string } | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    const userId = data?.claims?.sub;
    if (error || !userId) return null;

    return { userId };
  },
);

/** The signed-in user's profile row. Redirects if not signed in. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const { userId } = await verifySession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  return data;
});

/**
 * The user's MAL connection, or null when they have not linked one.
 *
 * Null drives the "Connect MyAnimeList" onboarding state; a row with
 * status `disconnected` or `needs_reauth` drives the reconnect banners.
 */
export const getMalConnection = cache(async (): Promise<MalConnection | null> => {
  const { userId } = await verifySession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("mal_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return data;
});

/** All identities (email, google, discord…) linked to the current account. */
export const getUserIdentities = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUserIdentities();

  if (error) return [];
  return data.identities;
});
