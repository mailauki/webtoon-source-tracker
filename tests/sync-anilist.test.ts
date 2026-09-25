import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { pullActionFor } from "@/lib/sync/sync-anilist";

/**
 * What the AniList pull is allowed to touch.
 *
 * These two rules are the reason this module is not a copy of syncMalList, and
 * both fail silently if broken: overwriting a MAL-backed row makes the two
 * syncs fight, with whichever ran last winning and the user's progress
 * flip-flopping between visits — which looks like data loss, not a bug.
 */

describe("pullActionFor", () => {
  it("creates a title only AniList has", () => {
    expect(pullActionFor({ idMal: null }, false)).toBe("create");
  });

  it("adds the entry when the catalog already holds the AniList-only title", () => {
    // Another user added it first; the row exists, this user's entry does not.
    expect(pullActionFor({ idMal: null }, true)).toBe("entry_only");
  });

  // The important one. syncMalList owns anything MAL has, and it runs
  // alongside this pull.
  it("never touches a title MyAnimeList also has", () => {
    expect(pullActionFor({ idMal: 121496 }, false)).toBe("skip_mal_backed");
    expect(pullActionFor({ idMal: 121496 }, true)).toBe("skip_mal_backed");
  });

  // Decided by the id AniList publishes, not by what the catalog happens to
  // hold yet: a MAL title this app has not synced is still MAL's, and
  // syncMalList will bring it in with MAL's own metadata rather than
  // AniList's approximation of it.
  it("defers to MyAnimeList even when the catalog has not seen the title", () => {
    expect(pullActionFor({ idMal: 999999 }, false)).toBe("skip_mal_backed");
  });
});

/**
 * The catalog write must not go through PostgREST's `onConflict`.
 *
 * Uniqueness for AniList-only rows is a PARTIAL index, and Postgres only
 * accepts one as an ON CONFLICT arbiter when the statement restates its
 * predicate — which `on_conflict=` cannot do. Sync failed at runtime with
 * 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
 * specification"); nothing in the type system or the test suite caught it,
 * because the call is well-typed and only Postgres knows the index is partial.
 *
 * Asserted against the source so a future edit cannot quietly reintroduce the
 * shape that failed.
 */
describe("AniList catalog writes", () => {
  it("upsert AniList-only titles through the RPC, never onConflict", async () => {
    // Resolved from the project root: vitest runs with cwd there, and
    // import.meta.url is not a file URL under this config.
    const [sync, action] = await Promise.all([
      readFile("lib/sync/sync-anilist.ts", "utf8"),
      readFile("app/actions/add-anilist-entry.ts", "utf8"),
    ]);

    for (const source of [sync, action]) {
      expect(source).toContain("upsertAniListTitle");
      expect(source).not.toContain("media_type,anilist_media_id");
    }
  });
});

/**
 * Every AniList write path must stamp `mal_updated_at`.
 *
 * It drives the library's default sort, the collections ordering and
 * pick-random's "most neglected" pick. A null is not a missing nicety: the
 * sort pushes it to the bottom in both directions, and pick-random reads the
 * same null as "never touched" and over-recommends the row. Both symptoms
 * come from one omission, and nothing type-checks it.
 */
describe("AniList writes set the sort timestamp", () => {
  it("is stamped by the pull, the add action and the progress edit", async () => {
    const [sync, add, progress] = await Promise.all([
      readFile("lib/sync/sync-anilist.ts", "utf8"),
      readFile("app/actions/add-anilist-entry.ts", "utf8"),
      readFile("lib/progress/save-progress.ts", "utf8"),
    ]);

    for (const source of [sync, add, progress]) {
      expect(source).toContain("mal_updated_at");
    }
  });
});
