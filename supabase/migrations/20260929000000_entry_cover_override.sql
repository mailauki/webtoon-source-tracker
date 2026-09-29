-- A reader's own choice of poster for a title.
--
-- `media_titles.main_picture_url` is the catalog's cover, shared by every
-- reader and rewritten by every sync -- so it cannot hold a preference. The
-- override lives on the reader's own row instead: null means "whatever the
-- catalog has", and anything else wins over it on every card and on the entry
-- page.
--
-- It is a URL rather than an upload. The alternatives offered (MyAnimeList's
-- other pictures, AniList's cover) are already hosted, and a custom poster is
-- a link the reader pastes. Only https is accepted: the page is served over
-- https, and a plain-http image would be blocked as mixed content and show as
-- a broken cover.
--
-- No new policy: user_entries_update_own already limits writes to the owner,
-- and the syncs never name this column, so a re-sync leaves the choice alone.

alter table public.user_entries
  add column cover_url text
    constraint user_entries_cover_url_https
      check (cover_url is null or (cover_url ~ '^https://' and length(cover_url) <= 2048));

comment on column public.user_entries.cover_url is
  'The reader''s chosen poster for this title. Null falls back to media_titles.main_picture_url.';
