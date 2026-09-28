-- Alternate titles on the catalog, so searching your library finds a title by
-- any of its names rather than only the two the card can show.
--
-- `title` and `title_en` are what the UI displays; everything else a title is
-- known by — MAL's synonyms and Japanese title, AniList's native title and
-- synonyms — lands here. Searched in the browser only (lib/data/search.ts),
-- so there is no index: the shelf is fetched whole and matched client-side.
--
-- Not null with an empty default, so every existing row reads as "no alternate
-- titles yet" and fills the next time a sync or add path writes it.

alter table public.media_titles
  add column alt_titles text[] not null default '{}';

-- The AniList upsert RPC gains a parameter, which changes its signature, so
-- the old one is dropped rather than left behind as a second overload that
-- would silently keep writing rows without alternate titles.
drop function public.media_titles_upsert_anilist(
  bigint, text, text, text, text, int, int, text, text
);

create function public.media_titles_upsert_anilist(
  p_anilist_media_id bigint,
  p_title            text,
  p_title_en         text   default null,
  p_main_picture_url text   default null,
  p_media_kind       text   default null,
  p_num_chapters     int    default null,
  p_num_volumes      int    default null,
  p_mal_status       text   default null,
  p_nsfw             text   default null,
  p_alt_titles       text[] default null
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.media_titles as t
    (media_type, mal_media_id, anilist_media_id, title, title_en,
     main_picture_url, mal_media_kind, num_chapters, num_volumes,
     mal_status, nsfw, alt_titles, synced_at)
  values
    ('manga', null, p_anilist_media_id, p_title, p_title_en,
     p_main_picture_url, p_media_kind, p_num_chapters, p_num_volumes,
     p_mal_status, p_nsfw, coalesce(p_alt_titles, '{}'), now())
  -- The partial index's predicate restated — see
  -- 20260923023638_anilist_title_upsert_rpc.sql for why this function exists.
  on conflict (media_type, anilist_media_id)
    where mal_media_id is null and anilist_media_id is not null
  do update set
    title            = excluded.title,
    title_en         = excluded.title_en,
    main_picture_url = excluded.main_picture_url,
    mal_media_kind   = excluded.mal_media_kind,
    num_chapters     = excluded.num_chapters,
    num_volumes      = excluded.num_volumes,
    mal_status       = excluded.mal_status,
    nsfw             = excluded.nsfw,
    alt_titles       = excluded.alt_titles,
    synced_at        = now()
  returning t.id;
$$;

revoke all on function public.media_titles_upsert_anilist(
  bigint, text, text, text, text, int, int, text, text, text[]
) from public, anon, authenticated;

grant execute on function public.media_titles_upsert_anilist(
  bigint, text, text, text, text, int, int, text, text, text[]
) to service_role;
