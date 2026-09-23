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
