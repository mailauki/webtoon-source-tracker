"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type IdentityState = { error?: string; message?: string } | null;

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * Turn a linking failure into something the person who clicked the button can
 * act on. Supabase's own messages are accurate but describe the *server's*
 * configuration ("Manual linking is disabled"), which reads as a bug rather
 * than a setting.
 */
function linkErrorMessage(error: AuthError | null): string {
  switch (error?.code) {
    case "manual_linking_disabled":
      // Dashboard toggle: Authentication → Advanced. OFF by default.
      return "Linking extra logins isn't switched on for this app yet. You can still sign in with any provider that uses the same email address as your account.";
    case "identity_already_exists":
      return "That login is already connected to another account.";
    default:
      return error?.message ?? "Could not start linking.";
  }
}

/**
 * Link an additional OAuth provider to the CURRENT account.
 *
 * Same-email identities auto-link on sign-in, so this is for the other case:
 * a provider using a *different* address (Discord on a personal email, say).
 * Requires "Manual Linking" to be enabled in Supabase → Authentication.
 */
export async function linkProvider(formData: FormData) {
  await verifySession();

  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "discord") {
    throw new Error("Unsupported provider");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: `${siteUrl()}/auth/callback?next=/settings` },
  });

  if (error || !data?.url) {
    redirect(`/settings?error=${encodeURIComponent(linkErrorMessage(error))}`);
  }

  redirect(data.url);
}

/**
 * Unlink an identity.
 *
 * Supabase requires at least two identities to unlink one — otherwise the
 * account would have no way to sign in. The UI disables the last one too, but
 * this is the authoritative check since actions are reachable directly.
 */
export async function unlinkProvider(
  _prev: IdentityState,
  formData: FormData,
): Promise<IdentityState> {
  await verifySession();

  const parsed = z.string().min(1).safeParse(formData.get("identity_id"));
  if (!parsed.success) {
    return { error: "Missing identity." };
  }

  const supabase = await createClient();
  const { data, error: listError } = await supabase.auth.getUserIdentities();

  if (listError || !data) {
    return { error: "Could not load your linked logins." };
  }

  if (data.identities.length < 2) {
    return {
      error:
        "This is your only way to sign in. Add another login before removing this one.",
    };
  }

  const identity = data.identities.find(
    (i) => i.identity_id === parsed.data,
  );
  if (!identity) {
    return { error: "That login is not linked to your account." };
  }

  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) {
    if (error.code === "single_identity_not_deletable") {
      return {
        error:
          "This is your only way to sign in. Add another login before removing this one.",
      };
    }
    if (error.code === "manual_linking_disabled") {
      return {
        error:
          "Managing linked logins isn't switched on for this app yet. Your existing logins all still work.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { message: `Removed ${identity.provider}.` };
}

/**
 * Add a password to an account created through OAuth, so the user gains an
 * email/password login (and with it, password recovery).
 */
export async function setPassword(
  _prev: IdentityState,
  formData: FormData,
): Promise<IdentityState> {
  await verifySession();

  const parsed = z
    .object({
      password: z.string().min(8, "Password must be at least 8 characters."),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      message: "Passwords do not match.",
      path: ["confirm"],
    })
    .safeParse({
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { message: "Password set. You can now sign in with your email too." };
}
