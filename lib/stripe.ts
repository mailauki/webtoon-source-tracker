import "server-only";

import Stripe from "stripe";

/**
 * Lazy client: `new Stripe("")` throws ("Neither apiKey nor config.authenticator
 * provided"), so a module-level instance would crash any import of this file
 * whenever STRIPE_SECRET_KEY is unset — tests, and local dev without Stripe
 * keys. Constructing it only when actually called avoids that.
 */
let client: Stripe | undefined;

export function getStripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  return client;
}
