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
 * Pass --revoke to remove the grant. --revoke requires --yes to actually
 * delete; without --yes it only prints what would happen.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const confirmed = args.includes("--yes");
const email = args.find((a) => !a.startsWith("--"));

if (!email) {
  console.error("Usage: yarn grant:admin <email> [--revoke [--yes]]");
  process.exit(1);
}

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) throw new Error("Supabase env vars missing from .env.local");

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// auth.users is not reachable through PostgREST, so look the account up
// through the Admin API rather than a table read.
//
// listUsers() is paginated (50 users per page by default) and does NOT
// auto-paginate. A bare call only ever sees page 1, so on a project with
// more than 50 accounts it can silently miss a real user and report
// "No account found" even though the account exists on a later page. Page
// through until we find a match or run out of pages — do not simplify this
// back to a single bare call.
let user: Awaited<
  ReturnType<typeof admin.auth.admin.listUsers>
>["data"]["users"][number] | undefined;

for (let page = 1; ; page++) {
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (listError) throw new Error(`Could not list users: ${listError.message}`);

  user = list.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (user) break;

  if (list.users.length < 200) break;
}

if (!user) {
  console.error(`No account found for ${email}.`);
  process.exit(1);
}

if (revoke) {
  if (!confirmed) {
    console.log(
      `Would revoke admin from ${email} (user_id: ${user.id}). Re-run with --yes to confirm.`,
    );
    process.exit(0);
  }
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
