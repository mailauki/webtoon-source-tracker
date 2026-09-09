import { AppShell } from "@/components/app-shell";
import { verifyAdmin } from "@/lib/auth/dal";

/**
 * The admin area.
 *
 * verifyAdmin() calls notFound() for everyone else, so /admin is a 404 rather
 * than a redirect — a redirect would confirm the route exists. This gate
 * covers the pages; each server action re-checks independently, because a
 * layout does not protect an action.
 *
 * Awaited directly in the layout body (not inside a Suspense boundary further
 * down), so the check runs before anything under it renders or streams —
 * exactly the ordering /discover got wrong once, where a redirect decided
 * after streaming had already begun arrived as a 200 with the redirect
 * embedded in the body instead of a real status code.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifyAdmin();
  return <AppShell>{children}</AppShell>;
}
