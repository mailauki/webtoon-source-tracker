-- Restore (media_type, mal_media_id) as a TOTAL unique index.
--
-- Making it partial in 20260923021250 was a mistake, and a silent one: every
-- existing MyAnimeList write upserts with `on_conflict=media_type,mal_media_id`
-- (lib/sync/sync-list.ts, app/actions/add-entry.ts, lib/sync/account-sync.ts,
-- the seed scripts), and Postgres only accepts a partial index as an ON
-- CONFLICT arbiter when the statement restates its predicate. PostgREST cannot,
-- so the MyAnimeList sync failed with 42P10 exactly as the AniList one did.
--
-- Nothing was lost by the partial predicate anyway. NULLs are distinct in a
-- unique index, so `where mal_media_id is not null` excluded only rows the
-- index would already have ignored — it bought nothing and broke the arbiter.
--
-- This is safe here in a way it is NOT for anilist_media_id. The reason the
-- AniList key stays partial is that lib/anilist/mirror.ts caches a resolved
-- AniList id onto MAL-backed rows, so a MAL-backed row and an AniList-only row
-- can legitimately hold the same AniList id. No code path ever writes a
-- mal_media_id onto an existing row that way, so two rows can never come to
-- share one MAL id.

drop index public.media_titles_mal_uniq;

create unique index media_titles_mal_uniq
  on public.media_titles (media_type, mal_media_id);
