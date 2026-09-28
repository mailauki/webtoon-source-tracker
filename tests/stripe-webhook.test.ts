import { beforeEach, describe, expect, it, vi } from "vitest";

const { constructEvent, grantPro, revokePro } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  grantPro: vi.fn(async () => ({}) as { error?: string }),
  revokePro: vi.fn(async () => {}),
}));

// lib/stripe.ts exposes getStripe() rather than a ready-made `stripe` const:
// constructing the real Stripe client throws when STRIPE_SECRET_KEY is unset
// (empty string is not a valid apiKey), which would break tests and local dev
// without Stripe keys. The webhook route calls getStripe() lazily instead.
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent } }) }));
vi.mock("@/lib/data/grant-pro", () => ({
  grantPro,
  revokePro,
  PRO_ALREADY_LINKED_ERROR: "This purchase already unlocked Pro on another account.",
}));

import { POST } from "@/app/api/stripe/webhook/route";

const call = () =>
  POST(
    new Request("https://example.com/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("rejects a bad signature", async () => {
    constructEvent.mockImplementationOnce(() => {
      throw new Error("bad signature");
    });
    expect((await call()).status).toBe(400);
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("grants Pro for a paid checkout", async () => {
    constructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    expect((await call()).status).toBe(200);
    expect(grantPro).toHaveBeenCalledWith("user-1", "stripe", "pi_1");
  });

  it("does not grant an unpaid checkout", async () => {
    constructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1", payment_status: "unpaid", payment_intent: "pi_1" } },
    });
    await call();
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("revokes on a full refund", async () => {
    constructEvent.mockReturnValueOnce({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", refunded: true } },
    });
    expect((await call()).status).toBe(200);
    expect(revokePro).toHaveBeenCalledWith("stripe", "pi_1");
  });

  it("does not revoke on a partial refund", async () => {
    constructEvent.mockReturnValueOnce({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", refunded: false } },
    });
    expect((await call()).status).toBe(200);
    expect(revokePro).not.toHaveBeenCalled();
  });

  it("grants Pro for a delayed payment method's success", async () => {
    constructEvent.mockReturnValueOnce({
      type: "checkout.session.async_payment_succeeded",
      data: { object: { client_reference_id: "user-1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    expect((await call()).status).toBe(200);
    expect(grantPro).toHaveBeenCalledWith("user-1", "stripe", "pi_1");
  });

  it("returns 500 so Stripe retries when grantPro fails for a reason other than the cross-account conflict", async () => {
    constructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    grantPro.mockResolvedValueOnce({ error: "some transient database error" });
    expect((await call()).status).toBe(500);
  });

  it("returns 200 when grantPro reports the same purchase already unlocked Pro elsewhere", async () => {
    constructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    grantPro.mockResolvedValueOnce({
      error: "This purchase already unlocked Pro on another account.",
    });
    expect((await call()).status).toBe(200);
  });

  it("returns 500 so Stripe retries when revokePro fails", async () => {
    constructEvent.mockReturnValueOnce({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", refunded: true } },
    });
    revokePro.mockRejectedValueOnce(new Error("db unavailable"));
    expect((await call()).status).toBe(500);
  });
});
