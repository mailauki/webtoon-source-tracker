import { redirect } from "next/navigation";

import { getOptionalSession } from "@/lib/auth/dal";

/**
 * This route reads cookies to decide where to send the visitor, so it cannot
 * be prerendered at build time — `cookies()` is unavailable then, and the
 * static shell 500s in production even though dev renders it fine.
 */
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await getOptionalSession();
  redirect(session ? "/library" : "/login");
}
