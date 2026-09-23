/**
 * Where a progress edit will actually be written.
 *
 * Every surface that offers to change progress has to answer the same question
 * before it does — the entry page's editor, the library card's context menu
 * and the sheet behind its ⋯ button all submit the same `updateProgress`
 * action, and all three previously assumed MyAnimeList. Keeping the rule here
 * means the answer cannot differ between them, and it stays free of
 * `server-only` so client components can call it directly.
 *
 * Two facts decide it per service, and neither implies the other: whether that
 * site has the title at all, and whether the user still syncs it there. This
 * mirrors the branches in app/actions/progress.ts exactly; if that action's
 * rules change, this changes with it.
 */

/**
 * The fields any row carries, from the library grid or a single entry.
 *
 * Both flags are optional here although the column is NOT NULL. A caller that
 * has not selected them should get today's behaviour — both services live —
 * rather than a silently disabled action: the column defaults to true, so
 * absent and true mean the same thing, and treating absent as false would turn
 * a missing `select` into a feature that stops working with no error.
 */
export type SyncTargetFields = {
  sync_to_mal?: boolean;
  sync_to_anilist?: boolean;
  media_titles?: {
    mal_media_id?: number | null;
    anilist_media_id?: number | null;
  } | null;
};

export type SyncTargets = {
  /** Service names this edit reaches, in the order the action writes them. */
  targets: string[];
  /**
   * True when the edit has no home at all.
   *
   * Only one shape produces it: a title AniList alone has, with AniList
   * syncing switched off. `updateProgress` refuses such an edit rather than
   * saving a local-only change no sync would ever carry, so the surfaces
   * offering it should not offer it.
   */
  nowhereToSave: boolean;
  /**
   * "MyAnimeList and AniList", the one that applies, or "your library only".
   *
   * The last is a real outcome rather than an error: a title paused on both
   * sides still records progress locally.
   */
  label: string;
};

export function syncTargets(entry: SyncTargetFields): SyncTargets {
  const title = entry.media_titles;

  // `?? true` rather than a bare read: see SyncTargetFields.
  const toMal = entry.sync_to_mal ?? true;
  const toAniList = entry.sync_to_anilist ?? true;

  const targets = [
    title?.mal_media_id != null && toMal ? "MyAnimeList" : null,
    title?.anilist_media_id != null && toAniList ? "AniList" : null,
  ].filter((name): name is string => name !== null);

  // Mirrors the action's own guard exactly: it refuses only when MyAnimeList
  // has no id for the title AND AniList syncing is off.
  const nowhereToSave = title?.mal_media_id == null && !toAniList;

  const label =
    targets.length === 2
      ? "MyAnimeList and AniList"
      : (targets[0] ?? "your library only");

  return { targets, nowhereToSave, label };
}
