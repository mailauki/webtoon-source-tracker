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
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" && session.client_reference_id && typeof session.payment_intent === "string") {
      await grantPro(session.client_reference_id, "stripe", session.payment_intent);
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    if (typeof charge.payment_intent === "string") {
      await revokePro("stripe", charge.payment_intent);
    }
  }
  return new Response("ok");
}
