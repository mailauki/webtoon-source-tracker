"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
/**
 * One attached source, narrowed to the fields these inputs actually read.
 *
 * Deliberately not `EntryDetail["entry_sources"][number]`: `getEntry` also
 * selects `sources.base_url`, which `getLibrary` does not, so keying off the
 * entry-page type would lock the library card out of reusing this form.
 */
export type EntrySource = {
  id: number;
  url: string | null;
  chapters_read: number | null;
  notes: string | null;
  is_primary: boolean;
  is_official: boolean;
  is_paid: boolean;
  sources: { id: number; name: string } | null;
};

/**
 * The editable fields of an entry_source, shared by the entry page's editor
 * and the library card's quick-edit dialog so the two cannot drift apart.
 *
 * Ids are suffixed per source because the entry page renders several of these
 * at once and duplicate ids would break every label's association.
 */
export function SourceFields({ source }: { source?: EntrySource }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`url-${source?.id ?? "new"}`}>Link (optional)</Label>
          <Input
            id={`url-${source?.id ?? "new"}`}
            name="url"
            type="url"
            inputMode="url"
            defaultValue={source?.url ?? ""}
            placeholder="https://…"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`chapters-${source?.id ?? "new"}`}>
            Chapters read here
          </Label>
          <Input
            id={`chapters-${source?.id ?? "new"}`}
            name="chapters_read"
            type="number"
            min={0}
            defaultValue={source?.chapters_read ?? ""}
            placeholder="—"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`notes-${source?.id ?? "new"}`}>Notes</Label>
        <Input
          id={`notes-${source?.id ?? "new"}`}
          name="notes"
          defaultValue={source?.notes ?? ""}
          placeholder="e.g. caught up here, waiting on coins"
        />
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_primary"
            defaultChecked={source?.is_primary ?? false}
            className="size-4 accent-[var(--brand)]"
          />
          Primary source
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_official"
            defaultChecked={source?.is_official ?? true}
            className="size-4 accent-[var(--brand)]"
          />
          Official
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_paid"
            defaultChecked={source?.is_paid ?? false}
            className="size-4 accent-[var(--brand)]"
          />
          Paid
        </label>
      </div>
    </>
  );
}
