"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ownAllLabel, type ChapterTotal } from "@/lib/data/chapter-totals";
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
  is_hiatus: boolean;
  is_owned: boolean;
  chapters_owned: number | null;
  sources: { id: number; name: string } | null;
};

/**
 * The editable fields of an entry_source, shared by the entry page's editor
 * and the library card's quick-edit dialog so the two cannot drift apart.
 *
 * Ids are suffixed per source because the entry page renders several of these
 * at once and duplicate ids would break every label's association.
 */
export function SourceFields({
  source,
  total = null,
}: {
  source?: EntrySource;
  /**
   * MAL's chapter count for this title, when it has one. Optional because the
   * form works without it — it only powers the fill-it-in shortcut.
   */
  total?: ChapterTotal | null;
}) {
  // Drives only whether the count below is *shown*. The checkbox stays
  // uncontrolled (defaultChecked), like every other field here, so this is a
  // mirror of it rather than the thing submitted.
  const [owned, setOwned] = useState(source?.is_owned ?? false);

  // A ref, not controlled state: the "own all" button writes straight to the
  // DOM value, which is what an uncontrolled input submits. Holding the count
  // in state instead would add a second source of truth for a number the form
  // already owns, and would need resetting every time `source` changed.
  const ownedCount = useRef<HTMLInputElement>(null);

  const id = source?.id ?? "new";

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`url-${id}`}>Link (optional)</Label>
          <Input
            id={`url-${id}`}
            name="url"
            type="url"
            inputMode="url"
            defaultValue={source?.url ?? ""}
            placeholder="https://…"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`chapters-${id}`}>Chapters read here</Label>
          <Input
            id={`chapters-${id}`}
            name="chapters_read"
            type="number"
            min={0}
            defaultValue={source?.chapters_read ?? ""}
            placeholder="—"
          />
        </div>
      </div>

      {/* Hidden rather than unmounted when the box is unticked. A hidden
          input is still submitted — only `disabled` takes a field out of a
          form — so a count typed here survives unticking Owned to see what it
          does, and re-ticking brings it back. These numbers are hand-entered
          and a form has no undo.

          The `hidden` attribute, not a `hidden` class, and the display class
          is dropped while it applies: `display: grid` from a utility would
          out-specify the UA stylesheet's `[hidden] { display: none }` and the
          block would stay on screen. This way it also leaves the
          accessibility tree, which a class alone would not do.

          The row that reads this back only speaks when `is_owned` is set (see
          EntrySourceEditor), so a remembered count on an unticked source is
          never reported as owned. */}
      <div hidden={!owned} className={owned ? "grid gap-2" : undefined}>
        <Label htmlFor={`chapters-owned-${id}`}>Chapters owned</Label>

        {/* Left blank the count stays null, which reads as "owned, not
            counted" rather than "owns none". Deliberately not bounded by the
            read count: buying ahead of what you have read, and reading ahead
            of what you own, are both ordinary. */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            ref={ownedCount}
            id={`chapters-owned-${id}`}
            name="chapters_owned"
            type="number"
            min={0}
            defaultValue={source?.chapters_owned ?? ""}
            placeholder="—"
            className="w-28"
          />

          {/* type="button" is load-bearing: a bare <button> inside a form
              defaults to submit, so this would save the row instead of
              filling the field. */}
          {total ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-pill"
              onClick={() => {
                if (ownedCount.current) {
                  ownedCount.current.value = String(total.count);
                }
              }}
            >
              {ownAllLabel(total)}
            </Button>
          ) : null}
        </div>

        {/* Says why there is no shortcut, rather than leaving its absence to
            be read as a bug. MAL carries no count for most ongoing webtoons. */}
        {total ? null : (
          <p className="text-xs text-muted-foreground">
            MyAnimeList has no chapter count for this title yet — type what you
            own.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`notes-${id}`}>Notes</Label>
        <Input
          id={`notes-${id}`}
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
        {/* "Paid" is about the source — it charges money. "Owned" is about
            the user — they paid it. A coin-gated app you have never bought
            from is Paid and not Owned, which is the whole point of keeping
            them as two boxes. */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_paid"
            defaultChecked={source?.is_paid ?? false}
            className="size-4 accent-[var(--brand)]"
          />
          Paid
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_owned"
            defaultChecked={source?.is_owned ?? false}
            onChange={(e) => setOwned(e.currentTarget.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          Owned
        </label>
        {/* Per source, not per title: a series can pause on one site and keep
            updating on another. */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_hiatus"
            defaultChecked={source?.is_hiatus ?? false}
            className="size-4 accent-[var(--brand)]"
          />
          On hiatus
        </label>
      </div>
    </>
  );
}
