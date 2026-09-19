-- Sticky search-page switches: include NSFW, and novels vs. webtoons.
--
-- Stored beside the shelf's own preferences rather than in their own table.
-- Both answer the same shape of question the chips do — "what should I be
-- looking at by default" — and a second per-user row keyed the same way would
-- buy nothing but a second read on every page.
--
-- Prefixed `search_` because, unlike every other column here, these narrow the
-- *search page* and not the library grid. An unprefixed `include_nsfw` would
-- read as a claim about the shelf, which it is not: the shelf shows everything
-- the user tracks, adult titles included, for the same reason getMangaList
-- syncs with `nsfw: true` — hiding a title someone put on their own list would
-- look like the app lost their data.
--
-- `search_include_nsfw` is a plain boolean with no sentinel: off unless asked
-- for, and a null reads as off. Defaulting to false keeps the safe direction
-- the catalog search already takes.
--
-- `search_media_kind` is nullable text rather than boolean, and takes no 'all'
-- sentinel. It is a two-sided switch, not a filter that can be off — there is
-- no "both" to store — so null means "never chose" and resolves to the
-- 'webtoons' default, exactly as the `sort` column does.

alter table public.library_prefs
  add column search_include_nsfw boolean not null default false,
  add column search_media_kind text;

comment on column public.library_prefs.search_include_nsfw is
  'When true, the search page asks MyAnimeList for adult titles as well.';

comment on column public.library_prefs.search_media_kind is
  'Which side of the search page''s novels/webtoons switch is selected: ''novels'', ''webtoons'', or null for the default.';
