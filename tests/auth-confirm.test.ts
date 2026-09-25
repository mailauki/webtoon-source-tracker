import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyOtp, exchangeCodeForSession } = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }),
}));

import { GET } from "@/app/auth/(auth)/confirm/route";

const confirm = (query: string) =>
  GET(new NextRequest(`https://example.com/auth/confirm?${query}`));

describe("/auth/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyOtp.mockResolvedValue({ error: null });
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("exchanges a {{ .ConfirmationURL }} code, keeping `next`", async () => {
    const response = await confirm("type=recovery&next=/auth/reset-password&code=abc");

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe("https://example.com/auth/reset-password");
  });

  it("still verifies a token_hash link", async () => {
    const response = await confirm("token_hash=h&type=signup");

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "signup" });
    expect(response.headers.get("location")).toBe("https://example.com/library");
  });

  it("sends an expired link to the login page with Supabase's reason", async () => {
    const response = await confirm(
      "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("error")).toBe("Email link is invalid or has expired");
  });

  it("rejects a link with nothing to verify", async () => {
    const response = await confirm("type=recovery");

    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/login");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("reports a failed exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "code verifier missing" } });
    const response = await confirm("code=abc");

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "code verifier missing",
    );
  });
});
