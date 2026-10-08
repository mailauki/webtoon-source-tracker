import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { SuggestionReview } from "@/components/admin/suggestion-review";
import { Button } from "@/components/ui/button";
import { displayTitle } from "@/lib/data/display-title";
import { getPendingSuggestions } from "@/lib/data/suggestions";

export const metadata = { title: "Suggestions · Admin" };

/**
 * Reader suggestions waiting on an admin: tags for titles, and collections
 * for Discover.
 *
 * No verifyAdmin() call — app/admin/layout.tsx already ran it.
 */
export default async function AdminSuggestionsPage() {
  const { tags, collections } = await getPendingSuggestions();

  return (
    <AppShell
      secondaryRow={
        <Button asChild variant="ghost">
          <Link href="/admin">
            <ArrowLeft data-icon="inline-start" />
            Admin
          </Link>
        </Button>
      }
    >
      <div className="grid gap-8">
        <section className="grid gap-3">
          <h2 className="font-display text-lg font-semibold">Tags</h2>
          {tags.length === 0 ? (
            <Empty>No tag suggestions.</Empty>
          ) : (
            <ul className="grid gap-1">
              {tags.map((s) => (
                <li key={s.id}>
                  <SuggestionReview kind="tag" id={s.id}>
                    <p className="truncate text-sm">
                      <span className="font-medium">{s.tag.name}</span>
                      <span className="text-muted-foreground"> on </span>
                      <span className="font-medium">{displayTitle(s.title)}</span>
                    </p>
                  </SuggestionReview>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Collections</h2>
            <p className="text-sm text-muted-foreground">
              Approving adds a copy to Discover as a curated collection,
              editable under Collections.
            </p>
          </div>
          {collections.length === 0 ? (
            <Empty>No collection suggestions.</Empty>
          ) : (
            <ul className="grid gap-1">
              {collections.map((s) => (
                <li key={s.id}>
                  <SuggestionReview kind="collection" id={s.id}>
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    {s.description ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {s.description}
                      </p>
                    ) : null}
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {s.titles.length} {s.titles.length === 1 ? "title" : "titles"}
                      {s.titles.length > 0 ? ": " : ""}
                      {s.titles.map(displayTitle).join(", ")}
                    </p>
                  </SuggestionReview>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
