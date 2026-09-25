import { userClientFromBearer } from "@/lib/auth/app-link";
import {
  addSchema,
  insertEntrySource,
  readSourceBody,
  sourceReply,
} from "@/lib/sources/entry-sources";

/**
 * Attaches a source to an entry, for the iOS app: the same validation and
 * write as the web's add-source form, as the app's user (RLS applies).
 *
 * Body: `{ sourceId, url?, chaptersRead?, chaptersOwned?, notes?,
 * isPrimary?, isOfficial?, isPaid?, isHiatus?, isOwned? }`.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/entries/[id]/sources">,
) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = addSchema.safeParse({
    ...(await readSourceBody(request)),
    // From the path, and spread last, so the body cannot redirect the write.
    entryId: (await params).id,
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  return sourceReply(await insertEntrySource(user.supabase, parsed.data));
}
