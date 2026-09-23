import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { AccountSync } from "@/components/settings/account-sync";
import { AniListDisconnect } from "@/components/settings/anilist-disconnect";
import { MalDisconnect } from "@/components/settings/mal-disconnect";
import { CustomSources } from "@/components/settings/custom-sources";
import { AgeRangeForm } from "@/components/settings/age-range-form";
import { LinkedLogins } from "@/components/settings/linked-logins";
import { MatureContent } from "@/components/settings/mature-content";
import { SetPasswordForm } from "@/components/settings/set-password-form";
import { Button } from "@/components/ui/button";
import {
  getAniListConnection,
  getMalConnection,
  getProfile,
  getUserIdentities,
  hidesMatureTitles,
  isAgeConfirmedAdult,
  verifySession,
} from "@/lib/auth/dal";
import { getSources } from "@/lib/data/sources";
import { formatLastSynced } from "@/lib/sync/staleness";

export const metadata = { title: "Settings" };

// Applies to the server actions this page runs, the account sync among them —
// see MAL_WRITE_BUDGET_MS in lib/sync/account-sync.ts, which is sized to fit.
export const maxDuration = 60;

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  await verifySession();

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  const [profile, identities, connection, anilist, catalog, hideMature, isAdult] =
    await Promise.all([
      getProfile(),
      getUserIdentities(),
      getMalConnection(),
      getAniListConnection(),
      getSources(),
      hidesMatureTitles(),
      isAgeConfirmedAdult(),
    ]);

  const malLinked = connection !== null && connection.status !== "disconnected";
  const anilistLinked = anilist !== null && anilist.status !== "disconnected";
  // The account sync needs both sides live. An expired connection on either
  // side hides it, and that side's section asks for a reconnect instead.
  const canSyncAccounts =
    connection?.status === "active" && anilist?.status === "active";

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
              {malLinked
                ? `Connected as ${connection.mal_username}.`
                : "Not connected. Searching works either way — connect it to add titles and sync your list."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-pill"
            >
              <Link href="/api/mal/connect">
                {malLinked ? "Reconnect" : "Connect MyAnimeList"}
              </Link>
            </Button>
            {malLinked ? <MalDisconnect /> : null}
          </div>
        </section>

        <section className="grid gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">AniList</h2>
            <p className="text-sm text-muted-foreground">
              {!anilistLinked
                ? "Not connected. Connect it to keep AniList in step with MyAnimeList."
                : anilist.status === "needs_reauth"
                  ? `Connected as ${anilist.anilist_username}, but the connection expired. Reconnect to keep syncing.`
                  : `Connected as ${anilist.anilist_username}. Progress you save here is copied to AniList too.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-pill"
            >
              <Link href="/api/anilist/connect">
                {anilistLinked ? "Reconnect" : "Connect AniList"}
              </Link>
            </Button>
            {anilistLinked ? <AniListDisconnect /> : null}
          </div>
        </section>

        {canSyncAccounts ? (
          <section className="grid gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Sync accounts
              </h2>
              <p className="text-sm text-muted-foreground">
                Bring your MyAnimeList and AniList lists into agreement —
                status, chapters, volumes and score. Titles are matched by
                their MyAnimeList id, so one that only exists on AniList is
                skipped. Nothing is ever deleted from either site.
              </p>
            </div>
            <AccountSync
              lastSyncedLabel={
                anilist.last_synced_at
                  ? formatLastSynced(anilist.last_synced_at)
                  : "Never synced"
              }
            />
          </section>
        ) : null}

        <section className="grid gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Your age</h2>
            <p className="text-sm text-muted-foreground">
              A range, not a birthday — it is all this app needs, and it is the
              shape a phone or store account would report if this were ever a
              native app. Until you confirm you are 18 or over, adult titles
              stay hidden wherever they would otherwise appear.
            </p>
          </div>
          <AgeRangeForm current={profile?.age_range ?? null} />
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
          <MatureContent initialHidden={hideMature} locked={!isAdult} />
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
