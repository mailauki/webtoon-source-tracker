import { describe, expect, it } from "vitest";

import { malAltTitles } from "@/lib/mal/alt-titles";
import { syncAltTitlesBatch } from "@/scripts/backfill-genres";

/**
 * Covers the alternate-titles half of scripts/backfill-genres.ts.
 *
 * The script cannot import lib/mal/alt-titles.ts (see its header), so it
 * restates the same rule; the last test here is what keeps the two copies
 * from drifting.
 */

type Update = { values: unknown; malId: unknown };

function stubClient(options: { failFor?: number } = {}) {
  const updates: Update[] = [];

  return {
    updates,
    from() {
      return {
        update: (values: unknown) => ({
          eq: () => ({
            eq: (_column: string, malId: unknown) => {
              updates.push({ values, malId });
              return Promise.resolve({
                error:
                  malId === options.failFor ? { message: "write failed" } : null,
              });
            },
          }),
        }),
      };
    },
  };
}

const node = {
  id: 1,
  title: "Na Honjaman Level Up",
  alternative_titles: {
    en: "Solo Leveling",
    ja: "俺だけレベルアップな件",
    synonyms: ["Only I Level Up", "Solo Leveling"],
  },
};

describe("syncAltTitlesBatch", () => {
  it("writes each title's alternate names onto its row", async () => {
    const admin = stubClient();
    // @ts-expect-error — a stub, not a full Supabase client.
    const written = await syncAltTitlesBatch(admin, [node]);

    expect(written).toBe(1);
    expect(admin.updates).toEqual([
      {
        values: { alt_titles: ["Only I Level Up", "俺だけレベルアップな件"] },
        malId: 1,
      },
    ]);
  });

  it("skips a title with nothing to add", async () => {
    const admin = stubClient();
    // @ts-expect-error — a stub, not a full Supabase client.
    const written = await syncAltTitlesBatch(admin, [{ id: 2, title: "X" }]);

    expect(written).toBe(0);
    expect(admin.updates).toEqual([]);
  });

  it("keeps going past a failed write", async () => {
    const admin = stubClient({ failFor: 1 });
    // @ts-expect-error — a stub, not a full Supabase client.
    const written = await syncAltTitlesBatch(admin, [node, { ...node, id: 3 }]);

    expect(written).toBe(1);
    expect(admin.updates).toHaveLength(2);
  });

  it("stores the same names the sync paths do", async () => {
    const admin = stubClient();
    // @ts-expect-error — a stub, not a full Supabase client.
    await syncAltTitlesBatch(admin, [node]);

    expect(admin.updates[0].values).toEqual({ alt_titles: malAltTitles(node) });
  });
});
