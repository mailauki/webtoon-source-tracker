import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyTransaction, grantPro, userClientFromBearer } = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  grantPro: vi.fn(async () => ({})),
  userClientFromBearer: vi.fn(async () => ({ supabase: {}, userId: "3f1c6a52-0000-4000-8000-000000000001" })),
}));

vi.mock("@/lib/apple/verify-transaction", () => ({ verifyTransaction }));
vi.mock("@/lib/data/grant-pro", () => ({
  grantPro,
  PRO_ALREADY_LINKED_ERROR: "This purchase already unlocked Pro on another account.",
}));
vi.mock("@/lib/auth/app-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/app-link")>()),
  userClientFromBearer,
}));

import { POST } from "@/app/api/purchases/app-store/route";

const USER = "3f1c6a52-0000-4000-8000-000000000001";
const call = (body: unknown) =>
  POST(
    new Request("https://example.com/api/purchases/app-store", {
      method: "POST",
      headers: { authorization: "Bearer good" },
      body: JSON.stringify(body),
    }),
  );
const tx = (over: object = {}) => ({
  productId: "pro_unlock",
  originalTransactionId: "1000",
  appAccountToken: USER.toUpperCase(), // StoreKit sends uppercase UUIDs
  revoked: false,
  ...over,
});

describe("POST /api/purchases/app-store", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs a signed-in user", async () => {
    userClientFromBearer.mockResolvedValueOnce(null as never);
    expect((await call({ signedTransaction: "jws" })).status).toBe(401);
  });

  it("rejects a transaction Apple's signature doesn't verify", async () => {
    verifyTransaction.mockRejectedValueOnce(new Error("bad jws"));
    expect((await call({ signedTransaction: "jws" })).status).toBe(400);
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("rejects another product, or a refunded one", async () => {
    verifyTransaction.mockResolvedValueOnce(tx({ productId: "something_else" }));
    expect((await call({ signedTransaction: "jws" })).status).toBe(400);
    verifyTransaction.mockResolvedValueOnce(tx({ revoked: true }));
    expect((await call({ signedTransaction: "jws" })).status).toBe(400);
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("refuses a transaction bought for another account", async () => {
    verifyTransaction.mockResolvedValueOnce(tx({ appAccountToken: "11111111-1111-4111-8111-111111111111" }));
    expect((await call({ signedTransaction: "jws" })).status).toBe(403);
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("grants Pro for a verified purchase", async () => {
    verifyTransaction.mockResolvedValueOnce(tx());
    const response = await call({ signedTransaction: "jws" });
    expect(response.status).toBe(200);
    expect(grantPro).toHaveBeenCalledWith(USER, "app_store", "1000");
  });

  it("passes on grantPro's refusal", async () => {
    verifyTransaction.mockResolvedValueOnce(tx());
    grantPro.mockResolvedValueOnce({ error: "This purchase already unlocked Pro on another account." });
    const response = await call({ signedTransaction: "jws" });
    expect(response.status).toBe(409);
  });

  it("returns 500 so the app retries when grantPro fails for a reason other than the cross-account conflict", async () => {
    verifyTransaction.mockResolvedValueOnce(tx());
    grantPro.mockResolvedValueOnce({ error: "some transient database error" });
    const response = await call({ signedTransaction: "jws" });
    expect(response.status).toBe(500);
  });
});
