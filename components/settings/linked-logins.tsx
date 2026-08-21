"use client";

import { useActionState } from "react";
import type { UserIdentity } from "@supabase/supabase-js";

import {
  linkProvider,
  unlinkProvider,
  type IdentityState,
} from "@/app/actions/identities";
import { Button } from "@/components/ui/button";

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email & password",
  google: "Google",
  discord: "Discord",
};

const LINKABLE = ["google", "discord"] as const;

export function LinkedLogins({ identities }: { identities: UserIdentity[] }) {
  const [state, unlinkAction] = useActionState<IdentityState, FormData>(
    unlinkProvider,
    null,
  );

  // Removing the only identity would lock the account out permanently.
  const isLastIdentity = identities.length < 2;
  const linked = new Set(identities.map((i) => i.provider));

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {identities.map((identity) => (
          <li
            key={identity.identity_id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {PROVIDER_LABELS[identity.provider] ?? identity.provider}
              </p>
              {identity.identity_data?.email ? (
                <p className="truncate text-sm text-muted-foreground">
                  {identity.identity_data.email as string}
                </p>
              ) : null}
            </div>

            <form action={unlinkAction}>
              <input
                type="hidden"
                name="identity_id"
                value={identity.identity_id}
              />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="rounded-pill"
                disabled={isLastIdentity}
                title={
                  isLastIdentity
                    ? "This is your only way to sign in. Add another login first."
                    : undefined
                }
              >
                Remove
              </Button>
            </form>
          </li>
        ))}
      </ul>

      {state?.error ? (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      ) : null}

      {LINKABLE.some((p) => !linked.has(p)) ? (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            Add another way to sign in:
          </p>
          <div className="flex flex-wrap gap-2">
            {LINKABLE.filter((p) => !linked.has(p)).map((provider) => (
              <form key={provider} action={linkProvider}>
                <input type="hidden" name="provider" value={provider} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="rounded-pill"
                >
                  Link {PROVIDER_LABELS[provider]}
                </Button>
              </form>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
