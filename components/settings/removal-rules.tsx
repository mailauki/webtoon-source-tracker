"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  createRemovalRule,
  deleteRemovalRule,
  type RemovalRuleState,
} from "@/app/actions/removal-rules";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/data/entry-labels";

type Rule = {
  id: number;
  kind: string;
  value: string;
  from_library: boolean;
  from_mal: boolean;
  from_anilist: boolean;
};
type Option = { id: number; name: string };

const KINDS = [
  { value: "status", label: "Status" },
  { value: "source", label: "Source" },
  { value: "genre", label: "Genre" },
] as const;

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Standing rules that remove every title with a status, source or genre —
 * now and whenever another title comes to match. See
 * lib/entries/removal-rules.ts for when they run.
 */
export function RemovalRules({
  rules,
  sources,
  genres,
}: {
  rules: Rule[];
  sources: Option[];
  genres: Option[];
}) {
  const [kind, setKind] = useState<"status" | "source" | "genre">("status");
  const [remote, setRemote] = useState({ mal: false, anilist: false });
  const [state, action] = useActionState<RemovalRuleState, FormData>(
    createRemovalRule,
    null,
  );
  const [deleteState, deleteAction] = useActionState(deleteRemovalRule, null);

  const options: { value: string; label: string }[] =
    kind === "status"
      ? Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))
      : (kind === "source" ? sources : genres).map((o) => ({
          value: String(o.id),
          label: o.name,
        }));

  function describe(rule: Rule) {
    const kindLabel = KINDS.find((k) => k.value === rule.kind)?.label ?? rule.kind;
    const value =
      rule.kind === "status"
        ? (STATUS_LABELS[rule.value] ?? rule.value)
        : ((rule.kind === "source" ? sources : genres).find(
            (o) => String(o.id) === rule.value,
          )?.name ?? "Unknown");
    const where = [
      rule.from_library && "library",
      rule.from_mal && "MyAnimeList",
      rule.from_anilist && "AniList",
    ].filter(Boolean);
    return { title: `${kindLabel}: ${value}`, where: `From ${where.join(", ")}` };
  }

  return (
    <div className="grid gap-4">
      {rules.length ? (
        <ul className="grid gap-2">
          {rules.map((rule) => {
            const { title, where } = describe(rule);
            return (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{title}</p>
                  <p className="truncate text-sm text-muted-foreground">{where}</p>
                </div>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={rule.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete rule ${title}`}
                  >
                    <Trash2 />
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No rules yet.</p>
      )}
      {deleteState?.error ? (
        <p role="alert" className="text-sm text-alert">{deleteState.error}</p>
      ) : null}

      <form action={action} className="grid gap-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap gap-2">
          <select
            name="kind"
            aria-label="Match by"
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {/* Keyed on the kind so switching resets to that kind's first option. */}
          <select key={kind} name="value" aria-label="Value" className={`${selectClass} min-w-40`}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="grid gap-2 text-sm">
          <legend className="mb-1 font-medium">Remove from</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="from_library" defaultChecked className="size-4 accent-brand" />
            My library <span className="text-muted-foreground">— can be restored</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="from_mal"
              className="size-4 accent-alert"
              onChange={(e) => setRemote({ ...remote, mal: e.target.checked })}
            />
            MyAnimeList
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="from_anilist"
              className="size-4 accent-alert"
              onChange={(e) => setRemote({ ...remote, anilist: e.target.checked })}
            />
            AniList
          </label>
        </fieldset>

        {remote.mal || remote.anilist ? (
          <p className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert">
            Matching titles will be deleted from your{" "}
            {[remote.mal && "MyAnimeList", remote.anilist && "AniList"]
              .filter(Boolean)
              .join(" and ")}{" "}
            list now and whenever a title matches later, including during
            syncs. This can&rsquo;t be undone.
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <SubmitButton>
            {remote.mal || remote.anilist ? "Save and delete matches" : "Save rule"}
          </SubmitButton>
          {state?.error ? (
            <p role="alert" className="text-sm text-alert">{state.error}</p>
          ) : state?.message ? (
            <p className="text-sm text-muted-foreground">{state.message}</p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
