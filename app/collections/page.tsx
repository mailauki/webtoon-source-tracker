import { AppShell } from "@/components/app-shell";
import { MyCollections } from "@/components/my-collections";
import { verifySession } from "@/lib/auth/dal";
import { getMyCollections } from "@/lib/data/collections";

export const metadata = { title: "Your collections" };

/**
 * The viewer's own collections.
 *
 * Sits at /collections while curated ones live at /collections/[slug] and a
 * user's own at /collections/mine/[id]. The two shapes cannot collide:
 * collections_shape_ck gives curated rows a slug and user rows none, so
 * "mine" can never be a curated slug.
 */
export default async function CollectionsPage() {
  await verifySession();

  const collections = await getMyCollections();

  return (
    <AppShell>
      <MyCollections collections={collections} />
    </AppShell>
  );
}
