import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Privileged Supabase client. **Bypasses all RLS.**
 *
 * The `server-only` import above is a build-time guard: if this module is ever
 * imported (even transitively) into a Client Component, the build fails rather
 * than shipping the secret key to the browser.
 *
 * Use this only where the operation genuinely cannot run as the user:
 *   - reading/writing `private.mal_tokens`
 *   - writing `mal_connections` after the OAuth exchange
 *   - bulk upserts during sync
 *
 * Everything else should use the request-scoped client from `./server`, so RLS
 * stays in force. When this client touches user-owned rows, filter by user_id
 * explicitly — RLS is not there to catch a mistake.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. Add it to .env.local (Dashboard → Project Settings → API Keys).",
    );
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey,
    {
      auth: {
        // No session persistence or refresh: this client is not a user.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
