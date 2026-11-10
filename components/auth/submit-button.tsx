"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Submit button that disables itself while the enclosing form is pending.
 *
 * `useFormStatus` must be called from a component *inside* the <form>, which
 * is why this is its own component rather than a prop on the form.
 */
export function SubmitButton({
  children,
  className,
  pending: given,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * For a form submitted through `onSubmit` rather than `action` (see
   * lib/forms/submit-keeping-fields.ts), which `useFormStatus` cannot see.
   */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = given ?? status.pending;

  return (
    <Button
      type="submit"
      disabled={pending}
      className={
        className ??
        "w-full rounded-pill bg-brand font-bold text-brand-foreground hover:bg-brand/90"
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}
