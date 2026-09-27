import { z } from "zod";

import { VerificationException, VerificationStatus, verifyTransaction } from "@/lib/apple/verify-transaction";
import { userClientFromBearer } from "@/lib/auth/app-link";
import { grantPro, PRO_ALREADY_LINKED_ERROR } from "@/lib/data/grant-pro";

const bodySchema = z.object({ signedTransaction: z.string().min(1).max(20_000) });

/**
 * The iOS app posts each Pro transaction StoreKit hands it (a purchase, a
 * restore, or one arriving later through Transaction.updates). Verified here
 * against Apple's signature — the app's own say-so is never enough.
 *
 * The app buys with appAccountToken = the user's id, so a transaction can only
 * unlock the account that bought it.
 *
 * Response contract, which the iOS app relies on to decide what to do with
 * the transaction:
 *   200            granted. The app finishes the transaction.
 *   4xx            permanent refusal. The app finishes the transaction (it
 *                  will never succeed) and shows the error message:
 *                    400 — invalid/forged JWS, wrong product, or refunded
 *                    403 — bought for another account, or no appAccountToken
 *                    409 — this purchase already granted Pro elsewhere
 *   5xx            transient. The app leaves the transaction unfinished and
 *                  retries later (a redelivered Transaction.updates event, or
 *                  its own retry):
 *                    500 — server misconfiguration or a database failure
 *                    503 — Apple's own verification service (OCSP) was
 *                          unreachable; not this transaction's fault
 */
export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing transaction." }, { status: 400 });

  // An empty bundle id is a server misconfiguration, not a bad transaction:
  // left unchecked, the library would reject every real transaction with
  // INVALID_APP_IDENTIFIER (no bundle id ever equals ""), which looks
  // identical to a forged JWS from the caller's side. Fail loudly instead.
  if (!process.env.APPLE_BUNDLE_ID) {
    console.error("Apple purchase verification: APPLE_BUNDLE_ID is not set");
    return Response.json({ error: "Server misconfigured." }, { status: 500 });
  }

  let tx;
  try {
    tx = await verifyTransaction(parsed.data.signedTransaction);
  } catch (cause) {
    // Never log the JWS itself — just that verification failed and why.
    console.error("Apple purchase verification failed", cause);
    if (cause instanceof VerificationException && cause.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
      // Apple's OCSP responder was unreachable — not this transaction's
      // fault, and retrying later can succeed once it's back.
      return Response.json({ error: "Couldn't verify this purchase with Apple. Try again shortly." }, { status: 503 });
    }
    return Response.json({ error: "Couldn't verify this purchase with Apple." }, { status: 400 });
  }
  if (tx.productId !== "pro_unlock" || tx.revoked) {
    return Response.json({ error: "This purchase isn't an active Pro unlock." }, { status: 400 });
  }
  if (!tx.originalTransactionId) {
    return Response.json({ error: "This purchase is missing its transaction id." }, { status: 400 });
  }
  if (!tx.appAccountToken || tx.appAccountToken.toLowerCase() !== user.userId.toLowerCase()) {
    return Response.json({ error: "This purchase belongs to another account." }, { status: 403 });
  }

  const { error } = await grantPro(user.userId, "app_store", tx.originalTransactionId);
  if (error) {
    // Only the cross-account conflict is permanent; any other grantPro
    // failure is a transient DB error the app should retry (same split as
    // the Stripe webhook).
    return Response.json({ error }, { status: error === PRO_ALREADY_LINKED_ERROR ? 409 : 500 });
  }
  return Response.json({ ok: true });
}
