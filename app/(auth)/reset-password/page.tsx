import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { verifySession } from "@/lib/auth/dal";

export const metadata = { title: "New password · Source Tracker" };

/**
 * Reached via the recovery link, which /auth/confirm has already exchanged for
 * a session — so the user is authenticated here and `updateUser` can set the
 * new password. verifySession() bounces anyone arriving without that session.
 */
export default async function ResetPasswordPage() {
  await verifySession();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="font-display text-2xl font-bold">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Choose something you haven&apos;t used before.
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
