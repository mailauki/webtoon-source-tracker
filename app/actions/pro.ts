"use server";

import { redirect } from "next/navigation";

import { verifySession } from "@/lib/auth/dal";
import { getIsPro } from "@/lib/data/pro";
import { getStripe } from "@/lib/stripe";

/** Sends the user to Stripe Checkout for the one-time Pro unlock. */
export async function startProCheckout() {
  const { userId } = await verifySession();
  // A stale /pro tab, or a direct POST, must not be able to charge someone
  // who already has Pro.
  if (await getIsPro()) redirect("/pro");

  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
    // How the webhook knows whose purchase this is.
    client_reference_id: userId,
    success_url: `${site}/pro?purchased=1`,
    cancel_url: `${site}/pro`,
  });
  redirect(session.url!);
}
