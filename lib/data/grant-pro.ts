import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The only writer of pro_entitlements. Service role, because users must not
 * be able to grant themselves Pro; so user_id is always filtered explicitly.
 *
 * Re-granting an existing row (a re-purchase after a refund) clears
 * revoked_at. A grandfathered row is left alone: it already is Pro.
 */
export async function grantPro(
  userId: string,
  source: "app_store" | "stripe",
  externalId: string,
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("pro_entitlements")
    .select("source, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing && existing.revoked_at === null) return {};

  const { error } = await admin.from("pro_entitlements").upsert(
    { user_id: userId, source, external_id: externalId, granted_at: new Date().toISOString(), revoked_at: null },
    { onConflict: "user_id" },
  );
  if (error?.code === "23505") {
    return { error: "This purchase already unlocked Pro on another account." };
  }
  return error ? { error: error.message } : {};
}

/** A refund: turns off the Pro this purchase granted, if it is the one on record. */
export async function revokePro(source: "app_store" | "stripe", externalId: string) {
  await createAdminClient()
    .from("pro_entitlements")
    .update({ revoked_at: new Date().toISOString() })
    .eq("source", source)
    .eq("external_id", externalId);
}
