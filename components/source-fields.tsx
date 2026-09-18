"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  countChapters,
  formatRanges,
  formatRangesForInput,
  fromMultirange,
  highestOwned,
  parseRanges,
  stepHighest,
} from "@/lib/data/chapter-ranges";
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
  chapters_owned: string | null;
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

  // The one controlled field in this form. It has to be: the preview below
  // reads what has been typed, and the own-all button writes to it. Seeded
  // from the stored multirange in the hyphen form the parser accepts, so what
  // is shown re-submits as exactly what it came from.
  const [ownedText, setOwnedText] = useState(() =>
    formatRangesForInput(fromMultirange(source?.chapters_owned)),
  );
  const parsed = parseRanges(ownedText);

  /**
   * The stepper moves the highest owned chapter — see stepHighest.
   *
   * It edits the field rather than saving, unlike ProgressEditor's matching
   * control: that one owns its own form and writes straight to MyAnimeList, so
   * it needs the optimistic dance around a ~1s round trip. This sits inside a
   * form the user submits, so a step is just another edit and Save is still
   * the thing that commits it.
   */
  function step(delta: 1 | -1) {
    if (!parsed.ok) return;
    const next = stepHighest(parsed.ranges, delta, total?.count);
    setOwnedText(formatRangesForInput(next));
  }

  // Unparseable text is not steppable: rewriting the field from a failed parse
  // would silently discard whatever the user was in the middle of typing.
  const highest = parsed.ok ? highestOwned(parsed.ranges) : null;
  const cannotAdd =
    !parsed.ok || (total !== null && highest !== null && highest >= total.count);
  const cannotSubtract = !parsed.ok || highest === null;

  // What the line under the field says. Pulled out of the JSX because three
  // nested ternaries in a template read as a puzzle.
  let hint: string;
  if (!parsed.ok) {
    hint = parsed.error;
  } else if (parsed.ranges.length === 0) {
    hint = total
      ? "A range, or single chapters — or fill it from MyAnimeList."
      : "A range, or single chapters. MyAnimeList has no chapter count for this title yet.";
  } else {
    const n = countChapters(parsed.ranges);
    hint = `${n} ${n === 1 ? "chapter" : "chapters"}: ${formatRanges(parsed.ranges)}`;
  }

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

        {/* Text, not a number, because ownership is a set: the app has 1-40,
            a print volume covered 41-54, three were bought loose. Left blank
            it stays null, which reads as "owned, not counted" rather than
            "owns none". Deliberately not bounded by the read count: buying
            ahead of what you have read, and reading ahead of what you own,
            are both ordinary. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Matches the Progress stepper's shape: minus, value, plus. There
              the value is a number; here it is the field itself, since the
              set it edits cannot be shown as one.

              `type="button"` on all three is load-bearing: a bare <button>
              inside a form defaults to submit, so any of them would save the
              row instead of editing the field. */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-pill"
            disabled={cannotSubtract}
            onClick={() => step(-1)}
            aria-label="Own one fewer chapter"
          >
            <Minus className="size-4" />
          </Button>

          <Input
            id={`chapters-owned-${id}`}
            name="chapters_owned"
            value={ownedText}
            onChange={(e) => setOwnedText(e.target.value)}
            placeholder="e.g. 1-40, 55, 60"
            className="min-w-40 flex-1"
            aria-describedby={`chapters-owned-hint-${id}`}
            aria-invalid={!parsed.ok}
          />

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-pill"
            disabled={cannotAdd}
            onClick={() => step(1)}
            aria-label="Own one more chapter"
          >
            <Plus className="size-4" />
          </Button>

          {total ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-pill"
              onClick={() => setOwnedText(`1-${total.count}`)}
            >
              {ownAllLabel(total)}
            </Button>
          ) : null}
        </div>

        {/* A typed syntax needs a mirror, or the first time anyone finds out
            what the field made of their input is after saving. This says what
            was understood, in the same words the entry page will use. */}
        <p
          id={`chapters-owned-hint-${id}`}
          className={parsed.ok ? "text-xs text-muted-foreground" : "text-xs text-alert"}
        >
          {hint}
        </p>
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
