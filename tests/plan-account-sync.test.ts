import { describe, expect, it } from "vitest";

import {
  describeAccountSync,
  fromAniListEntry,
  fromMalEntry,
  planAccountSync,
  sameState,
  type ListState,
} from "@/lib/sync/plan-account-sync";

function state(overrides: Partial<ListState> = {}): ListState {
  return {
    status: "reading",
    chapters: 10,
    volumes: 0,
    score: 0,
    rereading: false,
    updatedAt: 1_000,
    ...overrides,
  };
}

const map = (entries: [number, ListState][]) => new Map(entries);

describe("sameState", () => {
  it("matches identical progress", () => {
    expect(sameState(state(), state({ updatedAt: 99 }))).toBe(true);
  });

  it("differs on chapters, volumes, score or status", () => {
    expect(sameState(state(), state({ chapters: 11 }))).toBe(false);
    expect(sameState(state(), state({ volumes: 1 }))).toBe(false);
    expect(sameState(state(), state({ score: 7 }))).toBe(false);
    expect(sameState(state(), state({ status: "on_hold" }))).toBe(false);
  });

  // AniList's REPEATING arrives as `reading`; MAL's site keeps a reread at
  // `completed`. Comparing the statuses would rewrite the title every sync.
  it("ignores the status while both sides are rereading", () => {
    expect(
      sameState(
        state({ status: "completed", rereading: true }),
        state({ status: "reading", rereading: true }),
      ),
    ).toBe(true);
  });
});

describe("planAccountSync", () => {
  it("leaves titles that already agree alone", () => {
    const plan = planAccountSync(map([[1, state()]]), map([[1, state()]]), "two_way");
    expect(plan.writes).toEqual([]);
    expect(plan.inSync).toBe(1);
  });

  it("copies the newer side over the older when syncing both ways", () => {
    const mal = map([
      [1, state({ chapters: 20, updatedAt: 2_000 })],
      [2, state({ chapters: 5, updatedAt: 1_000 })],
    ]);
    const anilist = map([
      [1, state({ chapters: 15, updatedAt: 1_000 })],
      [2, state({ chapters: 8, updatedAt: 3_000 })],
    ]);

    const { writes } = planAccountSync(mal, anilist, "two_way");
    expect(writes).toContainEqual({ malId: 1, target: "anilist", state: mal.get(1) });
    expect(writes).toContainEqual({ malId: 2, target: "mal", state: anilist.get(2) });
    expect(writes).toHaveLength(2);
  });

  it("falls back to MAL when the edit times cannot tell the sides apart", () => {
    const tie = planAccountSync(
      map([[1, state({ chapters: 1, updatedAt: 5 })]]),
      map([[1, state({ chapters: 2, updatedAt: 5 })]]),
      "two_way",
    );
    expect(tie.writes[0].target).toBe("anilist");

    const unknown = planAccountSync(
      map([[1, state({ chapters: 1, updatedAt: null })]]),
      map([[1, state({ chapters: 2, updatedAt: null })]]),
      "two_way",
    );
    expect(unknown.writes[0].target).toBe("anilist");
  });

  it("lets a one-way sync overwrite even a newer edit", () => {
    const mal = map([[1, state({ chapters: 1, updatedAt: 1 })]]);
    const anilist = map([[1, state({ chapters: 2, updatedAt: 9 })]]);

    expect(planAccountSync(mal, anilist, "mal_to_anilist").writes).toEqual([
      { malId: 1, target: "anilist", state: mal.get(1) },
    ]);
    expect(planAccountSync(mal, anilist, "anilist_to_mal").writes).toEqual([
      { malId: 1, target: "mal", state: anilist.get(1) },
    ]);
  });

  it("copies titles missing from one side, in the directions allowed", () => {
    const mal = map([[1, state()]]);
    const anilist = map([[2, state()]]);

    expect(planAccountSync(mal, anilist, "two_way").writes).toEqual([
      { malId: 1, target: "anilist", state: mal.get(1) },
      { malId: 2, target: "mal", state: anilist.get(2) },
    ]);
    expect(planAccountSync(mal, anilist, "mal_to_anilist").writes).toEqual([
      { malId: 1, target: "anilist", state: mal.get(1) },
    ]);
    expect(planAccountSync(mal, anilist, "anilist_to_mal").writes).toEqual([
      { malId: 2, target: "mal", state: anilist.get(2) },
    ]);
  });

  // The title may be past the cutoff with newer progress than the copy.
  it("never copies onto a side whose list was cut short", () => {
    const mal = map([[1, state()]]);
    const anilist = map([[2, state()]]);

    const plan = planAccountSync(mal, anilist, "two_way", {
      mal: false,
      anilist: true,
    });
    expect(plan.writes).toEqual([{ malId: 1, target: "anilist", state: mal.get(1) }]);
  });

  it("still reconciles titles both sides have when a list was cut short", () => {
    const plan = planAccountSync(
      map([[1, state({ chapters: 1, updatedAt: 1 })]]),
      map([[1, state({ chapters: 2, updatedAt: 2 })]]),
      "two_way",
      { mal: false, anilist: false },
    );
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].target).toBe("mal");
  });

  it("plans nothing for two empty lists", () => {
    const plan = planAccountSync(map([]), map([]), "two_way");
    expect(plan).toEqual({ writes: [], inSync: 0 });
  });
});

describe("fromMalEntry", () => {
  it("reads MAL's list status", () => {
    expect(
      fromMalEntry({
        node: { id: 1, title: "A" },
        list_status: {
          status: "completed",
          score: 8,
          num_chapters_read: 100,
          num_volumes_read: 10,
          is_rereading: true,
          updated_at: "2026-01-01T00:00:00+00:00",
        },
      }),
    ).toEqual({
      status: "completed",
      chapters: 100,
      volumes: 10,
      score: 8,
      rereading: true,
      updatedAt: Date.parse("2026-01-01T00:00:00Z"),
    });
  });

  it("returns null without a list status", () => {
    expect(fromMalEntry({ node: { id: 1, title: "A" } })).toBeNull();
  });
});

describe("fromAniListEntry", () => {
  const base = {
    mediaId: 50,
    status: "CURRENT" as const,
    score: 7.5,
    progress: 12,
    progressVolumes: null,
    updatedAt: 1_700_000_000,
    media: { id: 50, idMal: 5 },
  };

  it("converts AniList's vocabulary to MAL's", () => {
    expect(fromAniListEntry(base)).toEqual({
      status: "reading",
      chapters: 12,
      volumes: 0,
      score: 8,
      rereading: false,
      updatedAt: 1_700_000_000_000,
    });
  });

  it("reads REPEATING as reading again", () => {
    expect(fromAniListEntry({ ...base, status: "REPEATING" })).toMatchObject({
      status: "reading",
      rereading: true,
    });
  });

  it("treats a zero timestamp as unknown", () => {
    expect(fromAniListEntry({ ...base, updatedAt: 0 })?.updatedAt).toBeNull();
  });

  it("returns null without a status", () => {
    expect(fromAniListEntry({ ...base, status: null })).toBeNull();
  });
});

describe("describeAccountSync", () => {
  const empty = {
    toMal: 0,
    toAniList: 0,
    inSync: 0,
    unmatched: 0,
    remaining: 0,
    excluded: 0,
    failed: 0,
  };

  it("says when there was nothing to do", () => {
    expect(describeAccountSync({ ...empty, inSync: 4 })).toBe(
      "Nothing to change. 4 already matched.",
    );
  });

  it("says when titles were skipped by the user's own exclusions", () => {
    // Otherwise a run that wrote nothing looks like a bug rather than the
    // setting the user themselves chose.
    expect(describeAccountSync({ ...empty, excluded: 3 })).toContain(
      "3 titles skipped because you turned syncing off for them",
    );
    expect(describeAccountSync({ ...empty, excluded: 1 })).toContain(
      "1 title skipped because you turned syncing off for it",
    );
  });

  it("reports every count that is not zero", () => {
    expect(
      describeAccountSync({
        toMal: 1,
        toAniList: 3,
        inSync: 10,
        unmatched: 1,
        remaining: 20,
        excluded: 0,
        failed: 2,
      }),
    ).toBe(
      "3 titles updated on AniList, 1 title updated on MyAnimeList. 10 already matched. " +
        "1 title couldn't be matched between the two sites and was skipped. " +
        "2 titles couldn't be saved. 20 more to go — run it again to continue.",
    );
  });
});
