"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

import { CuratedCollectionForm } from "@/components/admin/curated-collection-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "New collection" and the dialog behind it, split out of
 * CuratedCollectionList so the button can sit in the shell's sticky row while
 * the list stays in the page body. The open state is the only thing the two
 * would have shared, and nothing in the list reads it.
 */
export function NewCollectionButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Button
        onClick={() => setCreating(true)}
        className="bg-brand font-bold text-brand-foreground hover:bg-brand/90"
      >
        <Plus data-icon="inline-start" />
        New collection
      </Button>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New curated collection</DialogTitle>
            <DialogDescription>
              An editorial shelf on Discover. Its slug goes in the URL and
              can&rsquo;t be changed afterwards.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each new collection starts from a
              blank form and a blank action state. On success this navigates
              to the new shelf rather than closing back to the list — a
              collection is made in order to put something in it, and the only
              place to do that is its own page. */}
          {creating ? (
            <CuratedCollectionForm
              onDone={(collectionId) => {
                setCreating(false);
                // createCuratedCollection always returns a collectionId on
                // success; the guard is only for the type, which has to allow
                // the edit form calling the same prop with none.
                if (collectionId !== undefined) {
                  router.push(`/admin/collections/${collectionId}`);
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
