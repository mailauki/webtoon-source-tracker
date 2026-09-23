-- Per-title control over which sites an entry's progress is written to.
--
-- Both default true, so every existing row keeps behaving exactly as it does
-- now: this is opt-out, and a user who never touches it never notices it.
--
-- These govern WRITES only. The local library still mirrors whatever each site
-- reports, so an excluded title stays in step on the way in and simply stops
-- being pushed on the way out. That is the narrower of the two meanings and
-- the one that cannot cause a silent divergence: a row that ignored a site's
-- reads as well would drift from both services with nothing to reconcile it.
--
-- sync_to_mal carries a second meaning that sync_to_anilist does not, and it
-- is the reason this is not a symmetric pair of flags. lib/sync/sync-list.ts
-- deletes entries MyAnimeList did not return, reading their absence as "the
-- user removed it there" — and that delete cascades to entry_sources, the
-- hand-entered data no sync can rebuild. A title the user has stopped pushing
-- to MyAnimeList may legitimately leave their MAL list, so its absence stops
-- being evidence of anything. Rows with sync_to_mal = false are therefore
-- exempt from the removal step, exactly as AniList-only rows already are.

alter table public.user_entries
  add column sync_to_mal     boolean not null default true,
  add column sync_to_anilist boolean not null default true;

-- Partial, because the interesting rows are the rare ones. The removal guard
-- in sync-list.ts reads the excluded set on every sync that reaches the delete
-- step, and a full-table scan for what is normally an empty set would be paid
-- on every sync for nothing.
create index user_entries_sync_excluded_idx
  on public.user_entries (user_id)
  where sync_to_mal = false or sync_to_anilist = false;

comment on column public.user_entries.sync_to_mal is
  'When false, progress is never written to MyAnimeList and the entry is exempt from the sync removal step.';

comment on column public.user_entries.sync_to_anilist is
  'When false, progress is never mirrored to AniList.';
