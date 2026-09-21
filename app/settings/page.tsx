import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { CustomSources } from "@/components/settings/custom-sources";
import { LinkedLogins } from "@/components/settings/linked-logins";
import { MatureContent } from "@/components/settings/mature-content";
import { SetPasswordForm } from "@/components/settings/set-password-form";
import { Button } from "@/components/ui/button";
import {
  getMalConnection,
  getProfile,
  getUserIdentities,
  hidesMatureTitles,
  verifySession,
} from "@/lib/auth/dal";
import { getSources } from "@/lib/data/sources";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  await verifySession();

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  const [profile, identities, connection, catalog, hideMature] =
    await Promise.all([
      getProfile(),
      getUserIdentities(),
      getMalConnection(),
      getSources(),
      hidesMatureTitles(),
    ]);

  const customSources = catalog.filter((s) => s.owner_id !== null);

  const hasPassword = identities.some((i) => i.provider === "email");

  return (
    <AppShell>
      <div className="grid gap-8">
        <h1 className="font-display text-2xl font-bold">Settings</h1>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert"
          >
            {error}
          </p>
        ) : null}

        <section className="grid gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Account</h2>
            <p className="text-sm text-muted-foreground">
              {profile?.display_name ?? "Your account"}
            </p>
          </div>
          <LinkedLogins identities={identities} />
        </section>

        {!hasPassword ? (
          <section className="grid gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Add a password
              </h2>
              <p className="text-sm text-muted-foreground">
                You signed up with a social login. Setting a password gives you
                a second way in — and a way to recover your account.
              </p>
            </div>
            <SetPasswordForm />
          </section>
        ) : null}

        <section className="grid gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">MyAnimeList</h2>
            <p className="text-sm text-muted-foreground">
              {connection && connection.status !== "disconnected"
                ? `Connected as ${connection.mal_username}.`
                : "Not connected."}
            </p>
          </div>
          <div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-pill"
            >
              <Link href="/api/mal/connect">
                {connection && connection.status !== "disconnected"
                  ? "Reconnect"
                  : "Connect MyAnimeList"}
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Adult content
            </h2>
            <p className="text-sm text-muted-foreground">
              MyAnimeList rates some titles as explicit or borderline. This
              decides whether they show up as you browse. It does not change
              what you track — an entry you already have stays on your list
              either way, and the search page keeps its own switch for asking
              MyAnimeList to return adult titles at all.
            </p>
          </div>
          <MatureContent initialHidden={hideMature} />
        </section>

        <section className="grid gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Your sources</h2>
            <p className="text-sm text-muted-foreground">
              Private to you, and grouped under “Other” anywhere sources are
              aggregated.
            </p>
          </div>
          <CustomSources sources={customSources} />
        </section>
      </div>
    </AppShell>
  );
}
