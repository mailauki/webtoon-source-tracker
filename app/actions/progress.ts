"use server";

import { verifySession } from "@/lib/auth/dal";
import {
  patchSchema,
  saveProgress,
  type ProgressState,
} from "@/lib/progress/save-progress";
import { createClient } from "@/lib/supabase/server";

export type { ProgressState };

/** The web's progress form. The save itself is in lib/progress/save-progress.ts. */
export async function updateProgress(
  _prev: ProgressState,
  formData: FormData,
): Promise<ProgressState> {
  const { userId } = await verifySession();

  const parsed = patchSchema.safeParse({
    entryId: formData.get("entry_id"),
    numChaptersRead: formData.get("num_chapters_read") ?? "",
    listStatus: formData.get("list_status") || undefined,
    score: formData.get("score") ?? "",
    total: formData.get("total") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  return saveProgress(await createClient(), userId, parsed.data);
}
