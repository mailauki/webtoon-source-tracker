import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CuratedCollectionList } from "@/components/admin/curated-collection-list";
import { NewCollectionButton } from "@/components/admin/new-collection-button";
import { Button } from "@/components/ui/button";
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
    <AppShell
      secondaryRow={
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <Link href="/admin">
              <ArrowLeft data-icon="inline-start" />
              Admin
            </Link>
          </Button>
          <NewCollectionButton />
        </div>
      }
    >
      <CuratedCollectionList collections={collections} />
    </AppShell>
  );
}
