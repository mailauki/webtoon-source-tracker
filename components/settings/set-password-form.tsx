"use client";

import { useActionState } from "react";

import { setPassword, type IdentityState } from "@/app/actions/identities";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Shown only to accounts with no email/password identity yet. */
export function SetPasswordForm() {
  const [state, action] = useActionState<IdentityState, FormData>(
    setPassword,
    null,
  );

  if (state?.message) {
    return <p className="text-sm text-muted-foreground">{state.message}</p>;
  }

  return (
    <form action={action} className="grid max-w-sm gap-3">
      <div className="grid gap-2">
        <Label htmlFor="new-password">Password</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full rounded-pill sm:w-auto sm:px-6">
        Set password
      </SubmitButton>
    </form>
  );
}
