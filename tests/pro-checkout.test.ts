import { afterEach, expect, it, vi } from "vitest";

const { verifySession, getIsPro, create, redirect } = vi.hoisted(() => ({
  verifySession: vi.fn(async () => ({ userId: "user-1" })),
  getIsPro: vi.fn(async () => false),
  create: vi.fn(async () => ({ url: "https://checkout.stripe.com/session-1" })),
  // next/navigation's redirect() throws to unwind the render — mimic that so
  // code after the call in the action never runs, same as in production.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth/dal", () => ({ verifySession }));
vi.mock("@/lib/data/pro", () => ({ getIsPro }));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create } } }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import { startProCheckout } from "@/app/actions/pro";

afterEach(() => vi.clearAllMocks());

it("redirects an already-Pro user to /pro without creating a Checkout session", async () => {
  getIsPro.mockResolvedValueOnce(true);
  await expect(startProCheckout()).rejects.toThrow("REDIRECT:/pro");
  expect(create).not.toHaveBeenCalled();
});

it("creates a Checkout session and redirects to it for a non-Pro user", async () => {
  getIsPro.mockResolvedValueOnce(false);
  await expect(startProCheckout()).rejects.toThrow(
    "REDIRECT:https://checkout.stripe.com/session-1",
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ client_reference_id: "user-1", mode: "payment" }),
  );
});
