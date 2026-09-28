import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * A removed title must be findable and addable again.
 *
 * Removing archives the entry (`archived_at`) rather than deleting it, and two
 * paths forgot that: the catalog search counted the archived row as owned and
 * hid the title, and the add actions upserted onto the archived row without
 * clearing it, so a re-add reported success and the title stayed hidden.
 * Neither shows up in types or in any test that does not reach Postgres, so
 * both are asserted against the source, the same way tests/sync-anilist.test.ts
 * pins its catalog writes.
 */

describe("removed titles", () => {
  it("are not counted as owned by the catalog search", async () => {
    const route = await readFile("app/api/catalog/search/route.ts", "utf8");
    const start = route.indexOf("async function ownedIds");
    expect(start).toBeGreaterThan(-1);
    const owned = route.slice(start);
    // Both lookups — by MAL id and by AniList id — skip archived entries.
    expect(owned.split('.is("archived_at", null)')).toHaveLength(3);
  });

  it("are restored when added again, from either site", async () => {
    const [mal, anilist] = await Promise.all([
      readFile("app/actions/add-entry.ts", "utf8"),
      readFile("app/actions/add-anilist-entry.ts", "utf8"),
    ]);

    for (const source of [mal, anilist]) {
      expect(source).toContain("archived_at: null");
    }
  });
});
