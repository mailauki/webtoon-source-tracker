import { describe, expect, it } from "vitest";

import { rankSources, TOP_SOURCE_LIMIT } from "@/lib/data/rank-sources";

type Row = { source_id: number; sources: { id: number; name: string } | null };

function row(id: number, name = `Source ${id}`): Row {
  return { source_id: id, sources: { id, name } };
}

describe("rankSources", () => {
  it("orders sources by how many entries use them", () => {
    const ranked = rankSources([row(1), row(2), row(2), row(3), row(2), row(3)]);

    expect(ranked.map((s) => s.name)).toEqual([
      "Source 2",
      "Source 3",
      "Source 1",
    ]);
  });

  it("returns nothing when the user has attached no sources", () => {
    expect(rankSources([])).toEqual([]);
  });

  it("caps the list so the submenu stays short", () => {
    const rows = Array.from({ length: TOP_SOURCE_LIMIT + 3 }, (_, i) =>
      row(i + 1),
    );

    expect(rankSources(rows)).toHaveLength(TOP_SOURCE_LIMIT);
  });

  it("counts each source once per attachment, not once per entry row", () => {
    const ranked = rankSources([row(1), row(1), row(2)]);

    expect(ranked[0]).toMatchObject({ id: 1, count: 2 });
    expect(ranked[1]).toMatchObject({ id: 2, count: 1 });
  });

  // The join is nullable: a source row the user can no longer see (deleted
  // custom source) comes back as null and must not become an unnamed item.
  it("drops attachments whose source did not join", () => {
    const ranked = rankSources([
      { source_id: 9, sources: null },
      row(1),
    ]);

    expect(ranked.map((s) => s.id)).toEqual([1]);
  });

  it("breaks ties by name so the order is stable between loads", () => {
    const ranked = rankSources([row(2, "Zebra"), row(1, "Alpha")]);

    expect(ranked.map((s) => s.name)).toEqual(["Alpha", "Zebra"]);
  });
});
