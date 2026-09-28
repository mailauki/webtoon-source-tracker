import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** grantPro's refusal when a purchase is already tied to a different account — permanent, never worth retrying. */
export const PRO_ALREADY_LINKED_ERROR = "This purchase already unlocked Pro on another account.";

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
  const { data: existing, error: readError } = await admin
    .from("pro_entitlements")
    .select("source, external_id, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  // A failed read must not fall through to the upsert below: `existing` would
  // read as null and overwrite an active grandfathered/app_store row.
  if (readError) return { error: readError.message };
  if (existing && existing.revoked_at === null) return {};
  // Same purchase, already revoked: a redelivered checkout.session.completed
  // (retry, dashboard resend, or racing an out-of-order refund) must not
  // resurrect a refund by clearing revoked_at again. A genuine re-purchase
  // carries a different external_id and still reaches the upsert below.
  if (existing && existing.source === source && existing.external_id === externalId) {
    return {};
  }

  const { error } = await admin.from("pro_entitlements").upsert(
    { user_id: userId, source, external_id: externalId, granted_at: new Date().toISOString(), revoked_at: null },
    { onConflict: "user_id" },
  );
  if (error?.code === "23505") {
    return { error: PRO_ALREADY_LINKED_ERROR };
  }
  return error ? { error: error.message } : {};
}

/**
 * A refund: turns off the Pro this purchase granted, if it is the one on
 * record. Throws on a Supabase error so the webhook can tell Stripe to retry
 * — silently swallowing it here would lose the refund.
 *
 * Out-of-order delivery (the refund arrives before the grant, so this UPDATE
 * matches no row) is accepted as a known gap rather than redesigned around:
 * there is nothing to revoke yet, and the row grantPro later inserts already
 * carries revoked_at: null, so the account would incorrectly end up Pro.
 * Stripe's `charge.refunded` for a same-session refund should not outrace
 * `checkout.session.completed` in practice, and this is a webhook, not the
 * charge path, so there is no user-visible symptom to chase further here.
 */
export async function revokePro(source: "app_store" | "stripe", externalId: string) {
  const { error } = await createAdminClient()
    .from("pro_entitlements")
    .update({ revoked_at: new Date().toISOString() })
    .eq("source", source)
    .eq("external_id", externalId);
  if (error) throw error;
}
