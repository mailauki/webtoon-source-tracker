import { beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle, upsert, update } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn(async (): Promise<{ error: { code?: string; message: string } | null }> => ({ error: null })),
  update: vi.fn(),
}));

/**
 * A stand-in for createAdminClient() shaped to exactly the calls
 * lib/data/grant-pro.ts makes:
 *   .from("pro_entitlements").select(...).eq(...).maybeSingle()
 *   .from("pro_entitlements").upsert(...)
 *   .from("pro_entitlements").update(...).eq(...).eq(...)
 */
function fakeAdminClient() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      upsert,
      update,
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => fakeAdminClient()),
}));

import { grantPro, revokePro } from "@/lib/data/grant-pro";

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  // update(...).eq(...).eq(...) — chainable, resolves on the second .eq().
  update.mockReturnValue({ eq: () => ({ eq: async () => ({ error: null }) }) });
});

describe("grantPro", () => {
  it("returns {} without writing when the existing row is already active", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { source: "grandfathered", external_id: null, revoked_at: null },
      error: null,
    });
    const result = await grantPro("user-1", "stripe", "pi_1");
    expect(result).toEqual({});
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns {} without writing when the same purchase is already revoked (redelivery)", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { source: "stripe", external_id: "pi_1", revoked_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    const result = await grantPro("user-1", "stripe", "pi_1");
    expect(result).toEqual({});
    expect(upsert).not.toHaveBeenCalled();
  });

  it("re-grants (clears revoked_at) when a revoked row has a different external_id (a re-purchase)", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { source: "stripe", external_id: "pi_OLD", revoked_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    const result = await grantPro("user-1", "stripe", "pi_NEW");
    expect(result).toEqual({});
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", source: "stripe", external_id: "pi_NEW", revoked_at: null }),
      { onConflict: "user_id" },
    );
  });

  it("returns the friendly message on a 23505 conflict (same purchase, another account)", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    upsert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } });
    const result = await grantPro("user-1", "stripe", "pi_1");
    expect(result).toEqual({ error: "This purchase already unlocked Pro on another account." });
  });

  it("returns the read error instead of falling through to the upsert", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    const result = await grantPro("user-1", "stripe", "pi_1");
    expect(result).toEqual({ error: "connection reset" });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("revokePro", () => {
  it("surfaces a Supabase error by throwing", async () => {
    update.mockReturnValue({ eq: () => ({ eq: async () => ({ error: { message: "db down" } }) }) });
    await expect(revokePro("stripe", "pi_1")).rejects.toMatchObject({ message: "db down" });
  });

  it("resolves without throwing when the update succeeds", async () => {
    await expect(revokePro("stripe", "pi_1")).resolves.toBeUndefined();
  });
});
