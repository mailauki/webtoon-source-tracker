import { redirect } from "next/navigation";

import { getOptionalSession } from "@/lib/auth/dal";

/**
 * This route reads cookies to decide where to send the visitor, so it cannot
 * be prerendered at build time — `cookies()` is unavailable then, and the
 * static shell 500s in production even though dev renders it fine.
 */
export const dynamic = "force-dynamic";

export default async function RootPage({ searchParams }: PageProps<"/">) {
  const session = await getOptionalSession();

  // Supabase reports OAuth failures that happen BEFORE the code exchange by
  // appending them to the root of the configured redirect target, not to
  // /auth/callback — so they arrive here rather than at our callback route.
  // Forwarding them keeps the reason visible; dropping them (as this route
  // used to) leaves the user bounced to /login with no explanation.
  const params = await searchParams;
  const reason =
    typeof params.error_description === "string"
      ? params.error_description
      : typeof params.error === "string"
        ? params.error
        : undefined;

  if (reason) {
    // Signed-in users were mid-link; everyone else was mid-sign-in.
    const page = session ? "/settings" : "/login";
    redirect(`${page}?error=${encodeURIComponent(reason)}`);
  }

  redirect(session ? "/library" : "/login");
}
