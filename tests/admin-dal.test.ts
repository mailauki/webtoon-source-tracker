import { describe, expect, it, vi, beforeEach } from "vitest";

// Every test below does `vi.resetModules()` + a dynamic `await import()` of
// the DAL. That pattern exists to defeat React's `cache()` memoization
// across tests (each test needs a fresh, uncached call). In practice it is
// defensive rather than load-bearing here: `cache()` only memoizes within an
// active render/request context, and Vitest/jsdom does not provide one, so
// `cache()` is inert in this suite even without resetModules. Concretely,
// this means these tests do NOT verify that `isAdmin`/`verifyAdmin` are
// still wrapped in `cache()` at all — a regression that dropped the wrapper
// would not be caught here. We keep resetModules/dynamic import anyway
// because it's harmless and would become necessary if a future test in this
// file gains a real render context. Do not treat this file as proof that
// cache() is covered when copying its pattern to new DAL tests.

const { maybeSingle, notFound, redirect } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound, redirect }));

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
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns the user id for an admin", async () => {
    maybeSingle.mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    const { verifyAdmin } = await import("@/lib/auth/dal");
    await expect(verifyAdmin()).resolves.toEqual({ userId: "user-1" });
  });
});
