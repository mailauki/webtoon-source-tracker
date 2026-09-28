import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/** Whether this account has Pro. RLS lets a user read only their own row. */
export async function hasPro(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("pro_entitlements")
    .select("user_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  return data !== null;
}

/** For server components: the signed-in user's Pro status. */
export async function getIsPro(): Promise<boolean> {
  const { userId } = await verifySession();
  return hasPro(await createClient(), userId);
}

/**
 * Whether linking `provider` is allowed: always with Pro; without it, also
 * when `provider`'s own row is already linked (a re-link, e.g. reconnecting
 * after `needs_reauth`); otherwise only while the *other* service is not
 * linked. Mirrors the database trigger, so the UI can send the user to /pro
 * before an OAuth round trip that would fail.
 */
export async function canLinkService(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: "mal" | "anilist",
): Promise<boolean> {
  if (await hasPro(supabase, userId)) return true;
  const own = provider === "mal" ? "mal_connections" : "anilist_connections";
  const { data: ownRow } = await supabase
    .from(own)
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (ownRow && ownRow.status !== "disconnected") return true;
  const other = provider === "mal" ? "anilist_connections" : "mal_connections";
  const { data } = await supabase
    .from(other)
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return !data || data.status === "disconnected";
}
