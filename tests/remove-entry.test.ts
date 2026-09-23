import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * Removal's invariants, asserted against the source.
 *
 * Each of these is a property no type checks and no unit test would catch,
 * because the failure is a missing line rather than a wrong one — and each has
 * a consequence that is silent until a user loses something.
 */

describe("removal keeps what cannot be rebuilt", () => {
  it("archives rather than deleting, so entry_sources survives", async () => {
    const source = await readFile("app/actions/remove-entry.ts", "utf8");

    // A hard delete would cascade to entry_sources: hand-entered URLs,
    // per-source progress and notes that no re-sync can reconstruct.
    expect(source).toContain("archived_at");
    expect(source).not.toMatch(/\.delete\(\)/);
  });

  it("writes to the remote lists before touching the local row", async () => {
    const source = await readFile("app/actions/remove-entry.ts", "utf8");

    // The same ordering addEntry and updateProgress document: the local row is
    // a cache, so it must never claim something the services have not agreed
    // to. A local archive written first would survive a failed remote delete.
    const mal = source.indexOf("deleteListStatus");
    const anilist = source.indexOf("deleteListEntry");
    const local = source.indexOf('.update({ archived_at:');

    expect(mal).toBeGreaterThan(-1);
    expect(anilist).toBeGreaterThan(-1);
    expect(local).toBeGreaterThan(mal);
    expect(local).toBeGreaterThan(anilist);
  });

  it("stops syncing a title removed from a site but kept locally", async () => {
    const source = await readFile("app/actions/remove-entry.ts", "utf8");

    // Without this the next sync reads the title's absence on that site as
    // news and either re-adds it or removes it locally — neither of which the
    // user asked for.
    expect(source).toContain("sync_to_mal: false");
    expect(source).toContain("sync_to_anilist: false");
  });
});

describe("archived titles stay out of the way", () => {
  it("is filtered from every query that lists a library", async () => {
    const [entries, collections] = await Promise.all([
      readFile("lib/data/entries.ts", "utf8"),
      readFile("lib/data/collections.ts", "utf8"),
    ]);

    // getLibrary, both getStatusCounts branches, and both collection reads.
    expect(entries.match(/\.is\("archived_at", null\)/g) ?? []).toHaveLength(3);
    expect(collections.match(/\.is\("archived_at", null\)/g) ?? []).toHaveLength(2);
  });

  it("is not resurrected by the MyAnimeList sync", async () => {
    const source = await readFile("lib/sync/sync-list.ts", "utf8");

    // The upsert would otherwise write the title's progress straight back from
    // MAL, which reads as the removal having silently failed.
    expect(source).toContain("liveRows");
    expect(source).toMatch(/archived/);
  });

  it("is exempt from the sync's removal step", async () => {
    const source = await readFile("lib/sync/sync-list.ts", "utf8");

    // Deleting an archived row would destroy the entry_sources that archiving
    // was chosen to preserve.
    const exempt = source.slice(source.indexOf("const exempt = ["));
    expect(exempt.slice(0, 400)).toContain("...archived");
  });

  it("can still be read by id, so it can be restored", async () => {
    const source = await readFile("lib/data/entries.ts", "utf8");

    // getEntry is deliberately unfiltered: it is the page a removed title is
    // restored from, and hiding it there would strand the row.
    const getEntry = source.slice(source.indexOf("export async function getEntry"));
    expect(getEntry).not.toContain('.is("archived_at", null)');
  });
});
