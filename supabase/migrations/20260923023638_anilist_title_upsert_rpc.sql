-- Upserting an AniList-only catalog row.
--
-- `media_titles_anilist_only_uniq` is a PARTIAL unique index, and Postgres
-- will only use one as an ON CONFLICT arbiter when the statement proves the
-- index predicate. PostgREST's `on_conflict=` parameter names columns and
-- cannot carry a WHERE clause, so every attempt from the client came back as
--
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- Two fixes were considered and one rejected. Making the index total — a plain
-- unique on (media_type, anilist_media_id) — does satisfy a bare arbiter, but
-- it also forbids a MAL-backed row and an AniList-only row from ever holding
-- the same AniList id. That combination is reachable: lib/anilist/mirror.ts
-- caches the resolved AniList id onto MAL-backed rows, so a title added from
-- AniList before MyAnimeList listed it would make that cache write fail with
-- 23505 the moment the two met. Verified against production data before
-- ruling it out.
--
-- So the predicate moves into a function instead, where it can be stated.

create or replace function public.media_titles_upsert_anilist(
  p_anilist_media_id bigint,
  p_title            text,
  p_title_en         text default null,
  p_main_picture_url text default null,
  p_media_kind       text default null,
  p_num_chapters     int  default null,
  p_num_volumes      int  default null,
  p_mal_status       text default null,
  p_nsfw             text default null
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.media_titles as t
    (media_type, mal_media_id, anilist_media_id, title, title_en,
     main_picture_url, mal_media_kind, num_chapters, num_volumes,
     mal_status, nsfw, synced_at)
  values
    ('manga', null, p_anilist_media_id, p_title, p_title_en,
     p_main_picture_url, p_media_kind, p_num_chapters, p_num_volumes,
     p_mal_status, p_nsfw, now())
  -- The predicate restated, which is the entire point of this function.
  on conflict (media_type, anilist_media_id)
    where mal_media_id is null and anilist_media_id is not null
  do update set
    -- Metadata only. Nothing here touches mal_media_id: a row that has since
    -- gained a MyAnimeList counterpart is no longer this function's to own,
    -- and the partial index means such a row would not match the arbiter
    -- anyway.
    title            = excluded.title,
    title_en         = excluded.title_en,
    main_picture_url = excluded.main_picture_url,
    mal_media_kind   = excluded.mal_media_kind,
    num_chapters     = excluded.num_chapters,
    num_volumes      = excluded.num_volumes,
    mal_status       = excluded.mal_status,
    nsfw             = excluded.nsfw,
    synced_at        = now()
  returning t.id;
$$;

-- Same grant shape as the token RPCs: the admin client only.
revoke all on function public.media_titles_upsert_anilist(
  bigint, text, text, text, text, int, int, text, text
) from public, anon, authenticated;

grant execute on function public.media_titles_upsert_anilist(
  bigint, text, text, text, text, int, int, text, text
) to service_role;
