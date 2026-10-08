"use server";

import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const themeSchema = z.enum(["light", "dark", "system"]);

/**
 * Saves the theme picked in Settings to the account, so it is the default on
 * every device this user signs in on (see ThemeDefault in AppShell).
 */
export async function saveTheme(theme: string): Promise<{ error?: string }> {
  const { userId } = await verifySession();

  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) return { error: "Pick light, dark or system." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ theme: parsed.data })
    .eq("id", userId);

  return error ? { error: error.message } : {};
}
