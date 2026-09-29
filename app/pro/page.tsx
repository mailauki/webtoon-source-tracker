import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { startProCheckout } from "@/app/actions/pro";
import { getIsPro } from "@/lib/data/pro";

export const metadata = { title: "Pro" };

export default async function ProPage({ searchParams }: PageProps<"/pro">) {
  const [isPro, { purchased }] = await Promise.all([getIsPro(), searchParams]);

  return (
    <AppShell>
      <div className="mx-auto grid max-w-xl gap-6">
        <h1 className="font-display text-2xl font-bold">Pro</h1>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Record which chapters you own at each source</li>
          <li>Sync to MyAnimeList and AniList at the same time</li>
          <li>Random pick: let the library choose what to read next</li>
          <li>Choose each title&apos;s poster, from MyAnimeList, AniList or your own link</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          One payment, yours for good — on the web and in the iOS app.
        </p>

        {isPro ? (
          <p className="font-medium">You have Pro. Thank you!</p>
        ) : purchased ? (
          // The webhook can land a moment after this redirect — and with an
          // async payment method (granted on async_payment_succeeded), the
          // payment itself may still be pending, not just unconfirmed here.
          <p className="font-medium">
            Payment submitted — Pro turns on once it&apos;s confirmed. Refresh if it hasn&apos;t.
          </p>
        ) : (
          <form action={startProCheckout}>
            <Button type="submit">Get Pro</Button>
          </form>
        )}
        <p className="text-sm text-muted-foreground">
          Also available as an in-app purchase in the iOS app.
        </p>
      </div>
    </AppShell>
  );
}
