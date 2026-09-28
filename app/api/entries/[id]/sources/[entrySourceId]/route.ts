import { userClientFromBearer } from "@/lib/auth/app-link";
import {
  deleteEntrySource,
  readSourceBody,
  removeSchema,
  sourceReply,
  updateSchema,
  writeEntrySource,
} from "@/lib/sources/entry-sources";

/**
 * Edits or removes one of an entry's sources, for the iOS app: the same
 * validation and writes as the web's source editor, as the app's user.
 *
 * PATCH writes every field, as the web form does, so the app sends the whole
 * row. Both ids come from the path, and the row must belong to that entry.
 */
type Context = RouteContext<"/api/entries/[id]/sources/[entrySourceId]">;

async function ids({ params }: Context) {
  const { id, entrySourceId } = await params;
  return { entryId: id, id: entrySourceId };
}

export async function PATCH(request: Request, context: Context) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = updateSchema.safeParse({
    ...(await readSourceBody(request)),
    ...(await ids(context)),
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  return sourceReply(await writeEntrySource(user.supabase, parsed.data));
}

export async function DELETE(request: Request, context: Context) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = removeSchema.safeParse(await ids(context));
  if (!parsed.success) {
    return Response.json({ error: "Could not remove that source." }, { status: 400 });
  }

  return sourceReply(await deleteEntrySource(user.supabase, parsed.data));
}
