import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CuratedCollectionList } from "@/components/admin/curated-collection-list";
import { getAllCuratedCollections } from "@/lib/data/admin";

export const metadata = { title: "Collections · Admin" };

/**
 * The curated shelves behind /discover: everything that exists, retired
 * included.
 *
 * No verifyAdmin() call — app/admin/layout.tsx already ran it, and the DAL's
 * cache() makes a second call a memo hit rather than a second real check.
 * Same reasoning AppShell uses for verifySession().
 */
export default async function AdminCollectionsPage() {
  const collections = await getAllCuratedCollections();

  return (
    <div className="grid gap-6">
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Admin
      </Link>

      <CuratedCollectionList collections={collections} />
    </div>
  );
}
