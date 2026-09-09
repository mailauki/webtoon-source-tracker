import { describe, expect, it, vi, beforeEach } from "vitest";

const { maybeSingle, notFound } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: "user-1" } }, error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

describe("isAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("is true when the user has an admins row", async () => {
    maybeSingle.mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    const { isAdmin } = await import("@/lib/auth/dal");
    await expect(isAdmin()).resolves.toBe(true);
  });

  it("is false when the user has no admins row", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { isAdmin } = await import("@/lib/auth/dal");
    await expect(isAdmin()).resolves.toBe(false);
  });

  it("is false when the query errors, rather than throwing", async () => {
    // A failed admin check must deny, never crash the page or grant access.
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { isAdmin } = await import("@/lib/auth/dal");
    await expect(isAdmin()).resolves.toBe(false);
  });
});

describe("verifyAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("calls notFound for a non-admin rather than redirecting", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { verifyAdmin } = await import("@/lib/auth/dal");
    await expect(verifyAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("returns the user id for an admin", async () => {
    maybeSingle.mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    const { verifyAdmin } = await import("@/lib/auth/dal");
    await expect(verifyAdmin()).resolves.toEqual({ userId: "user-1" });
  });
});
