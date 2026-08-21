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
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();

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
