import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="font-display text-2xl font-bold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you a link to set a new one.
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
