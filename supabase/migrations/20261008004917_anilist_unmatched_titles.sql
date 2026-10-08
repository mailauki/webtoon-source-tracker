-- Titles the last account sync could not pair between MyAnimeList and
-- AniList, so the settings page can list them for the user to add or link on
-- the other site by hand. Replaced wholesale on every account sync.
--
-- Shape: [{ "onlyOn": "mal" | "anilist", "id": <that site's id>, "title": text }]
alter table public.anilist_connections
  add column unmatched_titles jsonb not null default '[]'::jsonb;
