import { beforeEach, describe, expect, it, vi } from "vitest";

const { constructEvent, grantPro, revokePro } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  grantPro: vi.fn(async () => ({})),
  revokePro: vi.fn(async () => {}),
}));

// lib/stripe.ts exposes getStripe() rather than a ready-made `stripe` const:
// constructing the real Stripe client throws when STRIPE_SECRET_KEY is unset
// (empty string is not a valid apiKey), which would break tests and local dev
// without Stripe keys. The webhook route calls getStripe() lazily instead.
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent } }) }));
vi.mock("@/lib/data/grant-pro", () => ({ grantPro, revokePro }));

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

  it("revokes on refund", async () => {
    constructEvent.mockReturnValueOnce({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1" } },
    });
    expect((await call()).status).toBe(200);
    expect(revokePro).toHaveBeenCalledWith("stripe", "pi_1");
  });
});
