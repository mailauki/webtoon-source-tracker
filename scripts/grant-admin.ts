/**
 * Grants admin to one account.
 *
 * Run: yarn grant:admin someone@example.com
 *
 * This is the ONLY way an admins row is created. The table has no insert
 * policy, so RLS refuses every request that carries a user's JWT; the service
 * role bypasses RLS, which is why this script exists and why there is no
 * "promote user" button anywhere in the app.
 *
 * Pass --revoke to remove the grant.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) throw new Error("Supabase env vars missing from .env.local");

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"));

if (!email) {
  console.error("Usage: yarn grant:admin <email> [--revoke]");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// auth.users is not reachable through PostgREST, so look the account up
// through the Admin API rather than a table read.
const { data: list, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw new Error(`Could not list users: ${listError.message}`);

const user = list.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);

if (!user) {
  console.error(`No account found for ${email}.`);
  process.exit(1);
}

if (revoke) {
  const { error } = await admin.from("admins").delete().eq("user_id", user.id);
  if (error) throw new Error(`Revoke failed: ${error.message}`);
  console.log(`Revoked admin from ${email}.`);
} else {
  const { error } = await admin
    .from("admins")
    .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id" });
  if (error) throw new Error(`Grant failed: ${error.message}`);
  console.log(`Granted admin to ${email}.`);
}
