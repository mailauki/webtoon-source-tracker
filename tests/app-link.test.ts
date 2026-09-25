import { beforeEach, describe, expect, it } from "vitest";

import { issueTicket, readTicket } from "@/lib/auth/app-link";

const USER = "5b0c1d2e-0000-4000-8000-000000000001";

describe("app link tickets", () => {
  beforeEach(() => {
    process.env.SUPABASE_SECRET_KEY = "test-secret";
  });

  it("round-trips the user id", () => {
    expect(readTicket(issueTicket(USER))).toBe(USER);
  });

  it("rejects an expired ticket", () => {
    const ticket = issueTicket(USER, Date.now() - 11 * 60_000);
    expect(readTicket(ticket)).toBeNull();
  });

  it("rejects a ticket moved to another user", () => {
    const [, expires, signature] = issueTicket(USER).split(".");
    const other = "5b0c1d2e-0000-4000-8000-000000000002";
    expect(readTicket(`${other}.${expires}.${signature}`)).toBeNull();
  });

  it("rejects a ticket with a pushed-out expiry", () => {
    const [, expires, signature] = issueTicket(USER).split(".");
    expect(readTicket(`${USER}.${Number(expires) + 3600}.${signature}`)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(readTicket("garbage")).toBeNull();
  });
});
