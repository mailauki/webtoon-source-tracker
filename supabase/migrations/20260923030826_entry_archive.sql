-- Removing a title without destroying what cannot be rebuilt.
--
-- Nothing could take a title off the shelf: rows only ever left user_entries
-- when the MyAnimeList sync noticed MAL no longer had them. The obvious fix --
-- a delete -- cascades to entry_sources, which holds hand-entered URLs,
-- per-source progress and notes that no re-sync can reconstruct. Measured on
-- this database when the feature was written: 434 of 1,133 entries carried
-- source rows.
--
-- A user-initiated removal is also the one case where the user can be
-- deliberately wrong. So removal archives instead: the row and its sources
-- stay, the title leaves every surface that shows a library, and restoring is
-- a single update. This is the `archived_at` column TODO(soft-delete) asks for.
--
-- Archived rows are excluded by the application's queries rather than by RLS.
-- RLS would hide them from the restore view as well, and the sync paths run
-- through the admin client, which bypasses policies entirely -- so a policy
-- would give the appearance of a guarantee it could not keep.

alter table public.user_entries
  add column archived_at timestamptz;

-- Partial: archived rows are the rare ones, and every library read filters on
-- `archived_at is null`, so the index that matters is the one over live rows.
create index user_entries_live_idx
  on public.user_entries (user_id)
  where archived_at is null;

-- The restore view reads the other side, which is small enough to scan but
-- cheap to index alongside it.
create index user_entries_archived_idx
  on public.user_entries (user_id, archived_at desc)
  where archived_at is not null;

comment on column public.user_entries.archived_at is
  'When set, the user removed this title: hidden from the library and skipped by every sync, but kept with its entry_sources so it can be restored.';
