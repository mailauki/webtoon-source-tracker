-- Hiatus, per source
--
-- A title can pause on one site and continue on another: an official release
-- goes on break while a scanlation keeps going, or a series moves platforms and
-- the old host simply stops. So this is a flag on entry_sources rather than on
-- user_entries — "on hiatus" is a fact about where the title is read, not about
-- the title itself.
--
-- MAL's own `mal_status` is not a substitute. It describes the publication
-- upstream, is not editable by the user, and says nothing about the particular
-- site they read on — which is the gap this app exists to record.
--
-- Defaults false, like is_paid: an unmarked source is assumed to be updating,
-- which is true of the overwhelming majority of rows and keeps the backfill for
-- existing data a no-op.
--
-- No CHECK and no index. It is a boolean read off rows the library query has
-- already fetched, and the filtering happens in the browser (see
-- components/library-grid.tsx), so nothing ever queries on this column alone.

alter table public.entry_sources
  add column is_hiatus boolean not null default false;

comment on column public.entry_sources.is_hiatus is
  'The title has paused updating on this particular source. Distinct from media_titles.mal_status, which describes the upstream publication.';
