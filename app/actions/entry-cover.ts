"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { isPosterUrl } from "@/lib/data/entry-cover";
import { isProRequired, PRO_MESSAGES } from "@/lib/pro";
import { createClient } from "@/lib/supabase/server";

export type EntryCoverState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

/**
 * An empty value is a reset — back to the catalog's cover — and anything else
 * must be an https URL. Normalised through `URL` before it is stored, so a
 * paste like `HTTPS://…` still satisfies the column's lower-case check.
 */
const coverSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  coverUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || isPosterUrl(value), {
      message: "Use an image link that starts with https://",
    })
    .transform((value) => (value === "" ? null : new URL(value).href)),
});

/**
 * Sets, or clears, the reader's own poster for one title. Setting one is Pro;
 * clearing one is not.
 *
 * Local only: neither MyAnimeList nor AniList has anywhere to put a
 * per-reader cover, so there is nothing to send them and nothing remote to
 * fail first. Written with the request-scoped client, so RLS is what keeps a
 * reader to their own rows — an id that is not theirs updates nothing, which
 * is reported the same as one that does not exist.
 */
export async function setEntryCover(
  _prev: EntryCoverState,
  formData: FormData,
): Promise<EntryCoverState> {
  await verifySession();

  const parsed = coverSchema.safeParse({
    entryId: formData.get("entry_id"),
    coverUrl: formData.get("cover_url") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { entryId, coverUrl } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_entries")
    .update({ cover_url: coverUrl })
    .eq("id", entryId)
    .select("id");

  // Pro is enforced by the database (see the entry_cover_override
  // migration), which refuses setting a poster but never clearing one.
  if (isProRequired(error)) return { ok: false, error: PRO_MESSAGES.poster };
  if (error) return { ok: false, error: "Couldn't save the poster." };
  if (!data?.length) return { ok: false, error: "That title isn't on your shelf." };

  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/library");

  return {
    ok: true,
    message: coverUrl ? "Poster updated." : "Poster reset to the default.",
  };
}
