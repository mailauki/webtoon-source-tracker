import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="font-display text-2xl font-bold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to track where you read.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-alert/10 px-3 py-2 text-sm text-alert"
        >
          {error}
        </p>
      ) : null}

      <OAuthButtons next={next} />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <LoginForm next={next} />

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
