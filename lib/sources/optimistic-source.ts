import { parseRanges, toMultirange } from "@/lib/data/chapter-ranges";

/**
 * What a source form will save, as a row — so the entry page can show an
 * edit or an add the moment it is submitted, and keep showing it
 * until the re-render carrying the saved row arrives.
 *
 * Read the way the server action reads the same form
 * (app/actions/entry-sources.ts, lib/sources/entry-sources.ts): an absent
 * checkbox is false, blank text is null, and owned
 * chapters go through the same parser to the same multirange literal. Null
 * when the server would refuse the form, so nothing is shown that will not
 * be saved.
 */

/** The fields a source row shows, as lib/sources/entry-sources.ts writes them. */
export type SourceColumns = {
  url: string | null;
  chapters_read: number | null;
  chapters_owned: string | null;
  notes: string | null;
  is_primary: boolean;
  is_official: boolean;
  is_paid: boolean;
  is_hiatus: boolean;
  is_owned: boolean;
};

export function sourceColumnsFrom(formData: FormData): SourceColumns | null {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const flag = (name: string) => formData.get(name) === "on";

  const owned = parseRanges(text("chapters_owned"));
  if (!owned.ok) return null;

  const read = text("chapters_read");
  if (read !== "" && !/^\d+$/.test(read)) return null;

  return {
    url: text("url") || null,
    chapters_read: read === "" ? null : Number(read),
    chapters_owned: toMultirange(owned.ranges),
    notes: text("notes") || null,
    is_primary: flag("is_primary"),
    is_official: flag("is_official"),
    is_paid: flag("is_paid"),
    is_hiatus: flag("is_hiatus"),
    is_owned: flag("is_owned"),
  };
}

export type SourceChange<Row> =
  | { type: "update"; id: number; columns: SourceColumns }
  | { type: "add"; row: Row };

/**
 * A list of source rows with one pending change applied. Marking a row
 * primary demotes the others, as the save does.
 */
export function applySourceChange<
  Row extends { id: number; is_primary: boolean },
>(rows: Row[], change: SourceChange<Row>): Row[] {
  switch (change.type) {
    case "add": {
      const demoted = change.row.is_primary
        ? rows.map((row) => ({ ...row, is_primary: false }))
        : rows;
      return [...demoted, change.row];
    }
    case "update":
      return rows.map((row) =>
        row.id === change.id
          ? { ...row, ...change.columns }
          : change.columns.is_primary
            ? { ...row, is_primary: false }
            : row,
      );
  }
}
