import { describe, expect, it } from "vitest";

import {
  removalTargets,
  type RemovalRule,
  type RuleCandidate,
} from "@/lib/entries/removal-rules";

function rule(over: Partial<RemovalRule>): RemovalRule {
  return {
    id: 1,
    kind: "status",
    value: "dropped",
    from_library: true,
    from_mal: false,
    from_anilist: false,
    ...over,
  };
}

function entry(over: Partial<RuleCandidate> = {}): RuleCandidate {
  return {
    id: 10,
    list_status: "dropped",
    sync_to_mal: true,
    sync_to_anilist: true,
    media_titles: { mal_media_id: 1, anilist_media_id: 2, title_tags: [{ tag_id: 7 }] },
    entry_sources: [{ source_id: 3 }],
    ...over,
  };
}

describe("removalTargets", () => {
  it("matches by status, source or genre, and nothing else", () => {
    expect(removalTargets([rule({})], entry())).toEqual({
      fromLibrary: true,
      fromMal: false,
      fromAniList: false,
    });
    expect(removalTargets([rule({ kind: "source", value: "3" })], entry())).not.toBeNull();
    expect(removalTargets([rule({ kind: "genre", value: "7" })], entry())).not.toBeNull();
    expect(removalTargets([rule({ kind: "genre", value: "8" })], entry())).toBeNull();
    expect(removalTargets([rule({ value: "reading" })], entry())).toBeNull();
  });

  it("unions the targets of every matching rule", () => {
    const rules = [
      rule({ from_library: false, from_mal: true }),
      rule({ id: 2, kind: "source", value: "3", from_library: false, from_anilist: true }),
    ];
    expect(removalTargets(rules, entry())).toEqual({
      fromLibrary: false,
      fromMal: true,
      fromAniList: true,
    });
  });

  it("skips a site the title isn't on or was already removed from", () => {
    const remoteOnly = [rule({ from_library: false, from_mal: true, from_anilist: true })];
    // Already deleted there: syncing was turned off, so it isn't deleted again.
    expect(
      removalTargets(remoteOnly, entry({ sync_to_mal: false, sync_to_anilist: false })),
    ).toBeNull();
    expect(
      removalTargets(
        remoteOnly,
        entry({ media_titles: { mal_media_id: null, anilist_media_id: 2, title_tags: [] } }),
      ),
    ).toEqual({ fromLibrary: false, fromMal: false, fromAniList: true });
  });
});
