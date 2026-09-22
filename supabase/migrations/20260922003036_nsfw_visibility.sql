-- Adult-content visibility: a rating on the catalog, and a switch per user.
--
-- The catalog has never recorded a title's rating. MAL sends one on every node
-- this app already asks for (`nsfw` is in LIST_FIELDS, and lib/mal/types.ts
-- parses it), but it was only ever read in flight — searchManga drops mature
-- results before they reach the client and nothing was stored. So there was no
-- way to ask "is this title adult" about a row already in media_titles, which
-- is exactly what the library, the collections and the category pages need in
-- order to leave one out.

alter table public.media_titles
  -- MAL's own rating, stored verbatim rather than reduced to a boolean:
  -- 'white' (safe), 'gray' (may be inappropriate), 'black' (adult). Keeping
  -- the string means a later change of mind about where the line sits is a
  -- code change, not a migration — and `isMature` in lib/data/nsfw.ts is the
  -- one place that draws it.
  --
  -- Nullable, and null is NOT "safe": it is "never asked". Every row written
  -- before this migration has one, and `scripts/backfill-genres.ts` fills them
  -- in on the same per-title walk it already makes. Treating null as safe is
  -- still what the reads do — see lib/data/nsfw.ts for why the alternative
  -- (hiding everything unrated) would empty the shelf of a user who has
  -- simply not re-synced yet.
  add column nsfw text;

comment on column public.media_titles.nsfw is
  'MyAnimeList''s content rating for this title: white, gray, black, or null when it has never been fetched.';

alter table public.library_prefs
  -- Named `hide_nsfw`, not `include_nsfw`, for two reasons.
  --
  -- First, it pairs with `hide_hiatus` above it: both name the non-default
  -- action, so false is "show everything" and the column reads the same way
  -- the switch does.
  --
  -- Second, it must not be confused with `search_include_nsfw`, which is a
  -- different setting and stays. That one only widens what the *search page*
  -- asks MyAnimeList for; this one narrows what the app shows from its own
  -- catalog. A user can sensibly have both on: "find adult titles when I go
  -- looking" and "keep them off my shelf" are not contradictory.
  --
  -- Defaults to false, so nothing a user already tracks disappears the day
  -- this ships. That is the same reasoning getMangaList syncs with
  -- `nsfw: true`: hiding a title somebody put on their own list is only ever
  -- right when they asked for it.
  add column hide_nsfw boolean not null default false;

comment on column public.library_prefs.hide_nsfw is
  'When true, adult-rated titles are left out of the library, the collections and the category pages.';
