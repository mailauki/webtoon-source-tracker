import { describe, expect, it } from "vitest";

import { canLinkService } from "@/lib/data/pro";

/**
 * A stand-in for the Supabase client shaped to exactly the calls
 * canLinkService (via hasPro) makes:
 *   .from("pro_entitlements").select().eq().is("revoked_at", null).maybeSingle()
 *   .from(<mal|anilist>_connections).select().eq().maybeSingle()
 *
 * `hasPro` is always false here (no row) — these tests are all about the
 * non-Pro path. `statusByTable` gives each connections table's row status,
 * or omit a table to mean "no row".
 */
function fakeClient(statusByTable: Record<string, string>) {
  return {
    from: (table: string) => {
      if (table === "pro_entitlements") {
        return { select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
      }
      const status = statusByTable[table];
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: status === undefined ? null : { status } }) }),
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("canLinkService", () => {
  it("allows re-linking when this provider's own row is already linked, even with the other linked too, without Pro", async () => {
    const client = fakeClient({ mal_connections: "needs_reauth", anilist_connections: "active" });
    await expect(canLinkService(client, "user-1", "mal")).resolves.toBe(true);
  });

  it("refuses when this provider's own row is disconnected and the other is linked, without Pro", async () => {
    const client = fakeClient({ mal_connections: "disconnected", anilist_connections: "active" });
    await expect(canLinkService(client, "user-1", "mal")).resolves.toBe(false);
  });

  it("allows linking the first service when neither row exists, without Pro", async () => {
    const client = fakeClient({});
    await expect(canLinkService(client, "user-1", "mal")).resolves.toBe(true);
  });
});
