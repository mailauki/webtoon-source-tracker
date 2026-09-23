import { describe, expect, it } from "vitest";

import { syncTargets, type SyncTargetFields } from "@/lib/data/sync-targets";

/**
 * The one rule three surfaces have to agree on.
 *
 * The entry page's editor, the library card's context menu and the sheet
 * behind its ⋯ button all submit the same `updateProgress` action. Each used
 * to decide for itself where an edit went — or not decide at all — so a title
 * excluded from MyAnimeList offered "Save to MyAnimeList" on one surface and a
 * quick "Add 1 chapter" on another that wrote somewhere else entirely.
 */

function entry(over: {
  mal?: number | null;
  anilist?: number | null;
  syncMal?: boolean;
  syncAniList?: boolean;
}): SyncTargetFields {
  return {
    sync_to_mal: over.syncMal ?? true,
    sync_to_anilist: over.syncAniList ?? true,
    media_titles: {
      mal_media_id: over.mal === undefined ? 121496 : over.mal,
      anilist_media_id: over.anilist === undefined ? 105398 : over.anilist,
    },
  };
}

describe("syncTargets", () => {
  it("names both services when both are live", () => {
    const { targets, label, nowhereToSave } = syncTargets(entry({}));
    expect(targets).toEqual(["MyAnimeList", "AniList"]);
    expect(label).toBe("MyAnimeList and AniList");
    expect(nowhereToSave).toBe(false);
  });

  // The live case in this database: on both sites, excluded from MyAnimeList.
  it("drops a service the title is excluded from", () => {
    const { targets, label } = syncTargets(entry({ syncMal: false }));
    expect(targets).toEqual(["AniList"]);
    expect(label).toBe("AniList");
  });

  it("drops a service that does not have the title", () => {
    expect(syncTargets(entry({ anilist: null })).targets).toEqual(["MyAnimeList"]);
    expect(syncTargets(entry({ mal: null })).targets).toEqual(["AniList"]);
  });

  it("treats a title paused on both sides as local, not broken", () => {
    // updateProgress still records this edit; it just goes nowhere remote.
    const { targets, label, nowhereToSave } = syncTargets(
      entry({ syncMal: false, syncAniList: false }),
    );
    expect(targets).toEqual([]);
    expect(label).toBe("your library only");
    expect(nowhereToSave).toBe(false);
  });

  // The only shape the action refuses outright.
  it("reports no home for an AniList-only title with AniList switched off", () => {
    expect(syncTargets(entry({ mal: null, syncAniList: false })).nowhereToSave).toBe(
      true,
    );
  });

  it("does not call a MAL-backed title homeless when MAL is off", () => {
    // It still saves: the local row leads and AniList is mirrored if enabled.
    expect(syncTargets(entry({ syncMal: false })).nowhereToSave).toBe(false);
    expect(
      syncTargets(entry({ syncMal: false, syncAniList: false })).nowhereToSave,
    ).toBe(false);
  });

  it("survives a row with no joined title", () => {
    // getLibrary uses an inner join, so this should not occur; a caller
    // passing a partial row gets an answer rather than a crash. It reports no
    // targets, and `nowhereToSave` follows the action's own rule rather than
    // guessing — the action would take the AniList branch here too.
    const { targets, label } = syncTargets({
      sync_to_mal: true,
      sync_to_anilist: true,
      media_titles: null,
    });
    expect(targets).toEqual([]);
    expect(label).toBe("your library only");
  });
});
