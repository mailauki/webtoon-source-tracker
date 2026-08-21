import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./types";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Note `cookies()` is async in Next 16, so this function is too — every call
 * site must await it.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. That is expected and
            // harmless here: session refresh is handled in proxy.ts and in
            // Route Handlers / Server Actions, which *can* write. Swallowing
            // this is the documented Supabase pattern.
          }
        },
      },
    },
  );
}
