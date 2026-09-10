"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { TagForm } from "@/components/admin/tag-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "New tag" and the dialog behind it, split out of TagList so the button can
 * sit in the shell's sticky row while the list stays in the page body. The
 * open state is the only thing the two would have shared, and nothing in the
 * list reads it.
 */
export function NewTagButton() {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Button
        onClick={() => setCreating(true)}
        className="bg-brand font-bold text-brand-foreground hover:bg-brand/90"
      >
        <Plus data-icon="inline-start" />
        New tag
      </Button>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New tag</DialogTitle>
            <DialogDescription>
              A trope, theme or format readers can browse Discover by.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each new tag starts from a blank form
              and a blank action state rather than the last one's result. */}
          {creating ? <TagForm onDone={() => setCreating(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
