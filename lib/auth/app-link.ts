import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { verifySession } from "@/lib/auth/dal";

/**
 * Lets the iOS app start the MAL/AniList link flows.
 *
 * The connect/callback routes identify the user by their session cookie, but
 * the app opens them in an ASWebAuthenticationSession, which has no cookie.
 * So the app POSTs to /api/<provider>/connect with its Supabase access token,
 * gets back a URL carrying a short-lived signed ticket, and opens that. The
 * connect route parks the ticket in a cookie scoped to the callback, and the
 * callback reads the user from it instead of the session.
 *
 * The ticket is only ever minted for a verified bearer token, is bound to one
 * user, and expires with the OAuth cookies — it cannot do anything the user's
 * own session could not.
 */

/** The iOS app's ASWebAuthenticationSession completes on this scheme. */
export const APP_CALLBACK = "webtoonsourcetracker://linked";
export const APP_TICKET_COOKIE = "app_link_ticket";
const TICKET_TTL_SECONDS = 600;

function sign(payload: string): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  // Prefixed so an OAuth state (which signs `${userId}:${nonce}`) can never
  // pass as a ticket, or the other way round.
  return createHmac("sha256", secret).update(`app-link:${payload}`).digest("base64url");
}

export function issueTicket(userId: string, now = Date.now()): string {
  const payload = `${userId}.${Math.floor(now / 1000) + TICKET_TTL_SECONDS}`;
  return `${payload}.${sign(payload)}`;
}

/** The ticket's user id, or null when it is forged, malformed or expired. */
export function readTicket(ticket: string, now = Date.now()): string | null {
  const [userId, expires, signature] = ticket.split(".");
  if (!userId || !expires || !signature) return null;

  const a = Buffer.from(signature);
  const b = Buffer.from(sign(`${userId}.${expires}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return Number(expires) * 1000 > now ? userId : null;
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
 * The user a connect/callback request acts for: the ticket's when the app
 * started the flow (null if it is no longer valid), else the web session's.
 */
export async function linkUserId(ticket: string | null | undefined): Promise<string | null> {
  if (ticket) return readTicket(ticket);
  return (await verifySession()).userId;
}

/** Hands the app a URL to open in its ASWebAuthenticationSession. */
export async function appConnectUrl(request: Request, path: string): Promise<Response> {
  const userId = await userIdFromBearer(request);
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(path, request.url);
  url.searchParams.set("ticket", issueTicket(userId));
  return Response.json({ url: url.toString() });
}
