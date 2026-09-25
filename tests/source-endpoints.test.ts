import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = {
  table: string;
  op: string;
  values?: Record<string, unknown>;
  filters: [string, string, unknown][];
};

const { calls, createClient } = vi.hoisted(() => {
  const calls: Call[] = [];
  const getClaims = async (token: string) =>
    token === "good"
      ? { data: { claims: { sub: "user-1" } }, error: null }
      : { data: null, error: new Error("invalid JWT") };

  // Records each write and its filters; every query resolves without error.
  function from(table: string) {
    const call: Call = { table, op: "", filters: [] };
    const chain = {
      insert(values: Record<string, unknown>) {
        Object.assign(call, { op: "insert", values });
        calls.push(call);
        return chain;
      },
      update(values: Record<string, unknown>) {
        Object.assign(call, { op: "update", values });
        calls.push(call);
        return chain;
      },
      delete() {
        call.op = "delete";
        calls.push(call);
        return chain;
      },
      eq(column: string, value: unknown) {
        call.filters.push(["eq", column, value]);
        return chain;
      },
      neq(column: string, value: unknown) {
        call.filters.push(["neq", column, value]);
        return chain;
      },
      then(resolve: (value: { error: null }) => unknown) {
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return chain;
  }

  return { calls, createClient: vi.fn(() => ({ from, auth: { getClaims } })) };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST } from "@/app/api/entries/[id]/sources/route";
import { DELETE, PATCH } from "@/app/api/entries/[id]/sources/[entrySourceId]/route";

function request(method: string, body?: unknown, token: string | null = "good") {
  return new Request("https://example.com/api", {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const entry = (id: string) => ({ params: Promise.resolve({ id }) });
const row = (id: string, entrySourceId: string) => ({
  params: Promise.resolve({ id, entrySourceId }),
});

describe("iOS source endpoints", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("need a valid app token", async () => {
    expect((await POST(request("POST", { sourceId: 3 }, null), entry("7"))).status).toBe(401);
    expect((await PATCH(request("PATCH", {}, "forged"), row("7", "5"))).status).toBe(401);
    expect((await DELETE(request("DELETE", undefined, null), row("7", "5"))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("add as the path's entry, with nulls read as empty fields", async () => {
    const response = await POST(
      request("POST", {
        entryId: 99,
        sourceId: 3,
        url: "https://m.webtoons.com/en/x?utm_source=share",
        chaptersRead: null,
        chaptersOwned: "1-40, 55",
        notes: null,
      }),
      entry("7"),
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("insert");
    expect(calls[0].values).toMatchObject({
      entry_id: 7,
      source_id: 3,
      // Canonicalised, as the web form's links are.
      url: "https://www.webtoons.com/en/x",
      // Null is "not recorded", never 0 chapters.
      chapters_read: null,
      chapters_owned: "{[1,41),[55,56)}",
      notes: null,
    });
  });

  it("reject what the web form rejects", async () => {
    const badUrl = await POST(request("POST", { sourceId: 3, url: "not a url" }), entry("7"));
    expect(badUrl.status).toBe(400);

    const badRanges = await POST(request("POST", { sourceId: 3, chaptersOwned: "4o" }), entry("7"));
    expect(badRanges.status).toBe(400);
    expect((await badRanges.json()).error).toMatch(/4o/);

    expect(calls).toEqual([]);
  });

  it("edit one row, demoting the entry's other primary first", async () => {
    const response = await PATCH(
      request("PATCH", { id: 99, isPrimary: true, chaptersRead: 12 }),
      row("7", "5"),
    );

    expect(response.status).toBe(200);
    expect(calls.map((c) => c.op)).toEqual(["update", "update"]);
    expect(calls[0].values).toEqual({ is_primary: false });
    expect(calls[0].filters).toEqual([
      ["eq", "entry_id", 7],
      ["eq", "is_primary", true],
      ["neq", "id", 5],
    ]);
    expect(calls[1].values).toMatchObject({ is_primary: true, chapters_read: 12 });
    expect(calls[1].filters).toEqual([
      ["eq", "id", 5],
      ["eq", "entry_id", 7],
    ]);
  });

  it("remove only a row filed under the path's entry", async () => {
    const response = await DELETE(request("DELETE"), row("7", "5"));

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        table: "entry_sources",
        op: "delete",
        filters: [
          ["eq", "id", 5],
          ["eq", "entry_id", 7],
        ],
      },
    ]);
  });
});
