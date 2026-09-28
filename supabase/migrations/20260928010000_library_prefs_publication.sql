-- The library's Series filter: ongoing or completed series only.
--
-- Whether the series itself is still publishing, from media_titles.mal_status
-- — not the reader's own status, which the `status` column already holds.
--
-- Text with the `all` sentinel, like `status` and `source`, rather than a
-- boolean like hide_hiatus: it is a one-of-three choice (all, ongoing,
-- completed), and null still means "never chose" as it does for the chips.
-- The app reads anything it does not recognise as all (resolvePublication),
-- so a value a later version drops cannot empty the shelf.

alter table public.library_prefs
  add column publication text;

comment on column public.library_prefs.publication is
  'Library Series filter: ongoing, completed, or all. Null means never chose; both read as all.';
