import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { NewTagButton } from "@/components/admin/new-tag-button";
import { TagList } from "@/components/admin/tag-list";
import { getAllTags } from "@/lib/data/admin";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Tags · Admin" };

/**
 * The tag vocabulary: everything that exists, and the controls to change it.
 *
 * No verifyAdmin() call — app/admin/layout.tsx already ran it, and the DAL's
 * cache() makes a second call a memo hit rather than a second real check.
 * Same reasoning AppShell uses for verifySession().
 *
 * getAllTags() returns retired tags too. That is the whole reason this page
 * differs from /discover: `is_active` is presentation, and the surface that
 * sets it has to be able to see what it set.
 */
export default async function AdminTagsPage() {
  const tags = await getAllTags();

  return (
    <AppShell
      // Back out and the one thing this page creates, justified apart on the
      // sticky row — the same shape the collection detail page uses.
      secondaryRow={
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <Link href="/admin">
              <ArrowLeft data-icon="inline-start" />
              Admin
            </Link>
          </Button>
          <NewTagButton />
        </div>
      }
    >
      <TagList tags={tags} />
    </AppShell>
  );
}
