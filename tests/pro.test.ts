import { describe, expect, it } from "vitest";

import { PRO_MESSAGES, isProRequired } from "@/lib/pro";

describe("isProRequired", () => {
  it("recognises the database's Pro error and nothing else", () => {
    expect(isProRequired({ code: "PT402" })).toBe(true);
    expect(isProRequired({ code: "23505" })).toBe(false);
    expect(isProRequired(null)).toBe(false);
    expect(isProRequired(undefined)).toBe(false);
  });

  it("has a message for each gated feature", () => {
    expect(Object.keys(PRO_MESSAGES).sort()).toEqual(["owned", "pick", "sync"]);
  });
});
