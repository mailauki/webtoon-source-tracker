-- MAL's own tag groups, applied to the tags its sync already created.
--
-- MyAnimeList sends a flat `genres` array with nothing to say which of its
-- four advanced-search groups an entry came from, so syncGenres wrote every
-- one as `kind: 'genre'`. That put Isekai, Shounen and Erotica under a single
-- heading — and once adult content became something this app gates, left the
-- explicit ones indistinguishable from the rest.
--
-- lib/data/mal-taxonomy.ts now classifies them on the way in. This migration
-- is the other half: the rows that already exist, which that code will never
-- revisit because the genre upsert is `on conflict do nothing` precisely so
-- MAL can never modify a tag that exists.
--
-- Two constraints this respects:
--
--   * Only rows MAL created (`mal_genre_id is not null`). A tag invented here
--     is the admin's, and its kind is theirs to set.
--   * Only the kind. Names stay exactly as they are, including any renamed by
--     hand — that survival is the whole point of the ownership contract, and
--     this matches on slug, which a rename does not change.
--
-- Anything unlisted stays `genre`, which is both MAL's largest group and the
-- previous behaviour.

-- The kind check predates two of these values, so widen it first or every
-- update below is rejected. Purely additive: the four existing values stay
-- valid, so no row becomes invalid and nothing needs rewriting.
alter table public.tags drop constraint if exists tags_kind_check;
alter table public.tags add constraint tags_kind_check
  check (kind in ('genre', 'explicit', 'theme', 'demographic', 'trope', 'format'));

create temporary table mal_tag_kinds (slug text primary key, kind text not null)
  on commit drop;

insert into mal_tag_kinds (slug, kind) values
  -- Manga Explicit Genres. The reason this migration exists: these are what
  -- the age gate reads.
  ('ecchi', 'explicit'), ('erotica', 'explicit'), ('hentai', 'explicit'),

  -- Manga Demographics.
  ('josei', 'demographic'), ('kids', 'demographic'), ('seinen', 'demographic'),
  ('shoujo', 'demographic'), ('shounen', 'demographic'),

  -- Manga Themes.
  ('adult-cast', 'theme'), ('anthropomorphic', 'theme'), ('cgdct', 'theme'),
  ('childcare', 'theme'), ('combat-sports', 'theme'), ('crossdressing', 'theme'),
  ('delinquents', 'theme'), ('detective', 'theme'), ('educational', 'theme'),
  ('gag-humor', 'theme'), ('gore', 'theme'), ('harem', 'theme'),
  ('high-stakes-game', 'theme'), ('historical', 'theme'), ('idols-female', 'theme'),
  ('idols-male', 'theme'), ('isekai', 'theme'), ('iyashikei', 'theme'),
  ('love-polygon', 'theme'), ('love-status-quo', 'theme'),
  ('magical-sex-shift', 'theme'), ('mahou-shoujo', 'theme'),
  ('martial-arts', 'theme'), ('mecha', 'theme'), ('medical', 'theme'),
  ('memoir', 'theme'), ('military', 'theme'), ('music', 'theme'),
  ('mythology', 'theme'), ('organized-crime', 'theme'), ('otaku-culture', 'theme'),
  ('parody', 'theme'), ('performing-arts', 'theme'), ('pets', 'theme'),
  ('psychological', 'theme'), ('racing', 'theme'), ('reincarnation', 'theme'),
  ('reverse-harem', 'theme'), ('samurai', 'theme'), ('school', 'theme'),
  ('showbiz', 'theme'), ('space', 'theme'), ('strategy-game', 'theme'),
  ('super-power', 'theme'), ('survival', 'theme'), ('team-sports', 'theme'),
  ('time-travel', 'theme'), ('urban-fantasy', 'theme'), ('vampire', 'theme'),
  ('video-game', 'theme'), ('villainess', 'theme'), ('visual-arts', 'theme'),
  ('workplace', 'theme');

update public.tags t
   set kind = k.kind,
       updated_at = now()
  from mal_tag_kinds k
 where k.slug = t.slug
   and t.mal_genre_id is not null
   and t.kind is distinct from k.kind;
