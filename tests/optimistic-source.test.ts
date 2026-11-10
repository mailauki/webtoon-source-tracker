import { describe, expect, it } from "vitest";

import {
  applySourceChange,
  sourceColumnsFrom,
} from "@/lib/sources/optimistic-source";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

/**
 * The row a submitted source form shows before its save comes back. It has
 * to read the form the way the action does, or the row would show one thing
 * and then change to another when the stored row arrives.
 */
describe("sourceColumnsFrom", () => {
  it("reads every field the way the action stores it", () => {
    expect(
      sourceColumnsFrom(
        form({
          url: " https://tapas.io/series/x ",
          chapters_read: "12",
          chapters_owned: "1-40, 55",
          notes: "",
          is_primary: "on",
          is_paid: "on",
          is_owned: "on",
        }),
      ),
    ).toEqual({
      url: "https://tapas.io/series/x",
      chapters_read: 12,
      chapters_owned: "{[1,41),[55,56)}",
      notes: null,
      is_primary: true,
      is_official: false,
      is_paid: true,
      is_hiatus: false,
      is_owned: true,
    });
  });

  it("reads blanks as nothing recorded", () => {
    expect(sourceColumnsFrom(form({}))).toMatchObject({
      url: null,
      chapters_read: null,
      chapters_owned: null,
    });
  });

  // The server refuses these, so showing them would be showing a save that
  // is about to fail.
  it("shows nothing for a form the server would refuse", () => {
    expect(sourceColumnsFrom(form({ chapters_owned: "4o" }))).toBeNull();
    expect(sourceColumnsFrom(form({ chapters_read: "-1" }))).toBeNull();
  });
});

describe("applySourceChange", () => {
  const rows = [
    { id: 1, is_primary: true, url: null as string | null },
    { id: 2, is_primary: false, url: null as string | null },
  ];
  const columns = sourceColumnsFrom(form({ url: "https://a.example", is_primary: "on" }))!;

  it("updates the edited row and demotes the old primary", () => {
    const next = applySourceChange(rows, { type: "update", id: 2, columns });
    expect(next.map((r) => [r.id, r.is_primary, r.url])).toEqual([
      [1, false, null],
      [2, true, "https://a.example"],
    ]);
  });

  it("appends an added row, demoting the others when it is primary", () => {
    const next = applySourceChange(rows, {
      type: "add",
      row: { id: -1, is_primary: true, url: null },
    });
    expect(next.map((r) => [r.id, r.is_primary])).toEqual([
      [1, false],
      [2, false],
      [-1, true],
    ]);
  });
});
