import { signInWithProvider } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Google and Discord sign-in.
 *
 * Both go through a plain <form> posting to a server action, so this stays a
 * Server Component — no client JS needed for a redirect.
 */
export function OAuthButtons({ next }: { next?: string }) {
  return (
    <div className="grid gap-2">
      <form action={signInWithProvider}>
        <input type="hidden" name="provider" value="google" />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Button type="submit" variant="outline" className="w-full rounded-pill">
          <GoogleIcon />
          Continue with Google
        </Button>
      </form>

      <form action={signInWithProvider}>
        <input type="hidden" name="provider" value="discord" />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Button type="submit" variant="outline" className="w-full rounded-pill">
          <DiscordIcon />
          Continue with Discord
        </Button>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true">
      <path d="M20.32 4.57A19.79 19.79 0 0 0 15.43 3c-.24.42-.5.98-.68 1.42a18.3 18.3 0 0 0-5.5 0C9.07 3.98 8.8 3.42 8.57 3a19.74 19.74 0 0 0-4.9 1.57C.55 9.21-.3 13.73.13 18.19a19.9 19.9 0 0 0 6.03 3.05c.49-.66.92-1.37 1.29-2.11-.71-.27-1.39-.6-2.03-.98.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.16 0c.16.14.33.27.5.4-.64.38-1.32.71-2.03.98.37.74.8 1.45 1.29 2.11a19.87 19.87 0 0 0 6.03-3.05c.5-5.17-.85-9.65-3.55-13.62ZM8.02 15.45c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.2 0 2.17 1.09 2.15 2.42 0 1.33-.95 2.42-2.15 2.42Zm7.96 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.2 0 2.17 1.09 2.15 2.42 0 1.33-.94 2.42-2.15 2.42Z" />
    </svg>
  );
}
