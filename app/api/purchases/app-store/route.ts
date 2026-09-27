import { z } from "zod";

import { verifyTransaction } from "@/lib/apple/verify-transaction";
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
 */
export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing transaction." }, { status: 400 });

  let tx;
  try {
    tx = await verifyTransaction(parsed.data.signedTransaction);
  } catch {
    return Response.json({ error: "Couldn't verify this purchase with Apple." }, { status: 400 });
  }
  if (tx.productId !== "pro_unlock" || tx.revoked) {
    return Response.json({ error: "This purchase isn't an active Pro unlock." }, { status: 400 });
  }
  if (tx.appAccountToken?.toLowerCase() !== user.userId.toLowerCase()) {
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
