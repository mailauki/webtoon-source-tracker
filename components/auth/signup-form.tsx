"use client";

import { useActionState } from "react";

import { signUpWithEmail, type AuthState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(
    signUpWithEmail,
    null,
  );

  // On success the message is deliberately ambiguous about whether the account
  // already existed, so we replace the form rather than leave it submittable.
  if (state?.message) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-card-foreground">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
