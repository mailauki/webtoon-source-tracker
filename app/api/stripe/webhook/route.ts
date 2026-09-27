import type Stripe from "stripe";

import { grantPro, revokePro } from "@/lib/data/grant-pro";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe's word on a purchase. The success redirect proves nothing — anyone
 * can load that URL — so Pro is granted only here, from a signed event.
 *
 * Reachable without a session: proxy.ts excludes the whole `api/` prefix from
 * its matcher (see its `config.matcher`), same as the MAL/AniList callbacks.
 */
export async function POST(request: Request) {
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      process.env.STRIPE_WEBHOOK_SECRET ?? "",
    );
  } catch (cause) {
    // Never log the body or the webhook secret — just that verification failed.
    console.error("Stripe webhook: bad signature", cause);
    return new Response("Bad signature", { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" && session.client_reference_id && typeof session.payment_intent === "string") {
      const { error } = await grantPro(session.client_reference_id, "stripe", session.payment_intent);
      if (error) {
        console.error("Stripe webhook: grantPro failed", error);
        // The "already unlocked on another account" conflict is permanent —
        // Stripe retrying will never make a different account's purchase
        // conflict any less. Any other failure (a transient DB error) should
        // be retried, so only that one case returns 200.
        if (error !== "This purchase already unlocked Pro on another account.") {
          return new Response("grantPro failed", { status: 500 });
        }
      }
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    // charge.refunded also fires for a partial refund; only a full refund
    // turns Pro off.
    if (charge.refunded && typeof charge.payment_intent === "string") {
      try {
        await revokePro("stripe", charge.payment_intent);
      } catch (cause) {
        console.error("Stripe webhook: revokePro failed", cause);
        return new Response("revokePro failed", { status: 500 });
      }
    }
  }
  return new Response("ok");
}
