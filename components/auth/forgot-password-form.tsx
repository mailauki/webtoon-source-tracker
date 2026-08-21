"use client";

import { useActionState } from "react";

import { requestPasswordReset, type AuthState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    null,
  );

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

      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}
