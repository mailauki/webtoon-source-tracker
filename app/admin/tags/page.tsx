import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { TagList } from "@/components/admin/tag-list";
import { getAllTags } from "@/lib/data/admin";

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
    <div className="grid gap-6">
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Admin
      </Link>

      <TagList tags={tags} />
    </div>
  );
}
