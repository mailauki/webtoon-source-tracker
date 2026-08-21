import Link from "next/link";

import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Sign up · Source Tracker" };

export default function SignupPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="font-display text-2xl font-bold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Then connect MyAnimeList to bring in your list.
        </p>
      </div>

      <OAuthButtons />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SignupForm />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
