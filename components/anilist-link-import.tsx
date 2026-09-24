"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";

import {
  setEntrySourceUrl,
  type EntrySourceState,
} from "@/app/actions/entry-sources";
import { SubmitButton } from "@/components/auth/submit-button";
import type { LinkSuggestion } from "@/lib/data/anilist-links";

/**
 * AniList's reading links for the sources this entry already has but has no
 * URL for, each one a tap from becoming that source's link.
 *
 * Offered, never applied: the source list is hand-entered and a wrong link
 * AniList carries should not land there without the reader choosing it.
 */
export function AniListLinkImport({
  entryId,
  suggestions,
}: {
  entryId: number;
  suggestions: LinkSuggestion[];
}) {
  if (suggestions.length === 0) return null;

  return (
    <section className="grid gap-2 rounded-xl border border-border p-3">
      <h2 className="text-sm font-semibold">Links from AniList</h2>
      <ul className="grid gap-2">
        {suggestions.map((s) => (
          <Suggestion key={s.attachedId} entryId={entryId} suggestion={s} />
        ))}
      </ul>
    </section>
  );
}

function Suggestion({
  entryId,
  suggestion,
}: {
  entryId: number;
  suggestion: LinkSuggestion;
}) {
  const [state, action] = useActionState<EntrySourceState, FormData>(
    setEntrySourceUrl,
    null,
  );

  return (
    <li className="grid gap-1">
      <form action={action} className="flex items-center justify-between gap-3">
        <input type="hidden" name="entry_id" value={entryId} />
        <input type="hidden" name="url" value={suggestion.url} />
        <input type="hidden" name="id" value={suggestion.attachedId} />

        <div className="min-w-0 text-sm">
          <p className="font-medium">{suggestion.sourceName}</p>
          <a
            href={suggestion.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block truncate text-muted-foreground underline-offset-4 hover:underline"
          >
            {suggestion.url}
          </a>
        </div>

        <SubmitButton className="h-8 shrink-0 rounded-pill px-3">
          <Download className="size-4" />
          Use link
        </SubmitButton>
      </form>
      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
