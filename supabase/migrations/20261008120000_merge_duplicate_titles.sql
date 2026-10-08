-- Merging an AniList-only title into the MyAnimeList row for the same work.
--
-- How the duplicate happens. A title that reaches the catalog from AniList
-- with no MyAnimeList id — added from search before MAL listed it, or pulled
-- from an AniList list whose entry had no `idMal` yet — is stored as an
-- AniList-only row (mal_media_id null). When the same work later shows up on
-- the user's MyAnimeList list, syncMalList upserts on the MAL id, finds no
-- row, and creates a second one. From then on the library shows the title
-- twice, and nothing ever reconciles the two:
--
--   - the MAL sync's removal step exempts every AniList-only row, so the
--     stale copy is never cleaned up;
--   - the AniList pull skips any entry that carries a MAL id, so it never
--     looks at the stale copy again;
--   - mirrorToAniList caches the AniList id onto the MAL row, so both rows
--     end up pointing at the same AniList entry and overwrite each other there.
--
-- 20260923024612 says no code path writes a mal_media_id onto an existing
-- row, and that stays true: the AniList-only row is not promoted, it is
-- merged into the MAL row and then deleted. Promoting it would collide with
-- media_titles_mal_uniq whenever the MAL row already exists, which is exactly
-- the case being fixed.
--
-- How a pair is recognised. A MAL row that carries an AniList id X, and an
-- AniList-only row whose AniList id is also X. The MAL row's AniList id only
-- ever comes from AniList's own `idMal` mapping (lib/anilist/mirror.ts,
-- lib/sync/account-sync.ts, the search, and now the syncs below), so this is
-- AniList itself saying the two are one work.

-- ---------------------------------------------------------------------------
-- 1. Merge one AniList-only row into one MAL row
-- ---------------------------------------------------------------------------
--
-- Everything that points at a catalog row is moved: user_entries (and through
-- them entry_sources), collection_items and title_tags. user_entries and
-- collection_items are `on delete restrict`, so the final delete also proves
-- nothing was missed.
--
-- `p_user_on_mal` is the user whose MyAnimeList list is being synced, when
-- there is one. See step 3 for why it matters.

create or replace function private.merge_title_into(
  p_from        bigint,
  p_into        bigint,
  p_user_on_mal uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.media_titles;
  v_into public.media_titles;
begin
  -- Locked in id order so two syncs merging overlapping pairs cannot
  -- deadlock, and so an AniList pull inserting an entry against the row
  -- being merged away waits for the merge instead of racing it.
  perform 1 from public.media_titles
   where id in (p_from, p_into)
   order by id
   for update;

  select * into v_from from public.media_titles where id = p_from;
  select * into v_into from public.media_titles where id = p_into;

  -- Another sync got here first.
  if v_from.id is null or v_into.id is null then
    return false;
  end if;

  -- Only an AniList-only row is ever merged away, and only into the MAL row
  -- AniList maps it to. Anything else is a caller bug, not a duplicate.
  if v_from.mal_media_id is not null
     or v_into.mal_media_id is null
     or v_from.media_type <> v_into.media_type
     or v_from.anilist_media_id is distinct from v_into.anilist_media_id
  then
    raise exception 'media_titles % is not a duplicate of %', p_from, p_into;
  end if;

  -- --- 2. Users who have the title twice ----------------------------------
  --
  -- The MAL row's entry survives: syncMalList owns its progress and will
  -- write it again on the next run anyway. What the other copy holds that the
  -- survivor does not is carried across rather than dropped.

  create temporary table merge_pairs on commit drop as
    select s.id as into_entry, l.id as from_entry, s.user_id
      from public.user_entries s
      join public.user_entries l on l.user_id = s.user_id
     where s.title_id = p_into
       and l.title_id = p_from;

  -- Sources only the duplicate has move to the survivor. Primary is kept only
  -- when the survivor has none, since an entry has at most one.
  update public.entry_sources es
     set entry_id   = p.into_entry,
         is_primary = es.is_primary and not exists (
           select 1 from public.entry_sources x
            where x.entry_id = p.into_entry and x.is_primary
         )
    from merge_pairs p
   where es.entry_id = p.from_entry
     and not exists (
       select 1 from public.entry_sources x
        where x.entry_id = p.into_entry and x.source_id = es.source_id
     );

  -- Sources both copies have: the survivor's row keeps its values and fills
  -- its gaps from the duplicate's. Owned chapters are unioned only for a Pro
  -- account, because entry_sources_require_pro refuses any other change to
  -- them, and a lapsed subscription must not fail a whole sync.
  update public.entry_sources s
     set url            = coalesce(s.url, l.url),
         notes          = coalesce(s.notes, l.notes),
         chapters_read  = greatest(s.chapters_read, l.chapters_read),
         is_owned       = case when private.has_pro(s.user_id)
                               then s.is_owned or l.is_owned
                               else s.is_owned end,
         chapters_owned = case
           when not private.has_pro(s.user_id) then s.chapters_owned
           when s.chapters_owned is null then l.chapters_owned
           when l.chapters_owned is null then s.chapters_owned
           else s.chapters_owned + l.chapters_owned
         end
    from merge_pairs p
    join public.entry_sources l on l.entry_id = p.from_entry
   where s.entry_id = p.into_entry
     and s.source_id = l.source_id;

  -- The entry itself. If the survivor was removed but the duplicate is still
  -- on the shelf, the duplicate is the copy the user was actually using, so
  -- its progress wins and the title stays visible. A custom poster follows
  -- the same Pro rule as the sources above.
  update public.user_entries s
     set archived_at = case
           when s.archived_at is not null and l.archived_at is null then null
           else s.archived_at
         end,
         list_status       = case when s.archived_at is not null and l.archived_at is null
                                  then l.list_status else s.list_status end,
         num_chapters_read = case when s.archived_at is not null and l.archived_at is null
                                  then l.num_chapters_read else s.num_chapters_read end,
         num_volumes_read  = case when s.archived_at is not null and l.archived_at is null
                                  then l.num_volumes_read else s.num_volumes_read end,
         score             = case when s.archived_at is not null and l.archived_at is null
                                  then l.score else s.score end,
         is_rereading      = case when s.archived_at is not null and l.archived_at is null
                                  then l.is_rereading else s.is_rereading end,
         mal_updated_at    = case when s.archived_at is not null and l.archived_at is null
                                  then l.mal_updated_at else s.mal_updated_at end,
         cover_url  = case when s.cover_url is null and private.has_pro(s.user_id)
                           then l.cover_url else s.cover_url end,
         created_at = least(s.created_at, l.created_at)
    from merge_pairs p
    join public.user_entries l on l.id = p.from_entry
   where s.id = p.into_entry;

  -- Takes the duplicate's leftover sources (the ones merged above) with it.
  delete from public.user_entries e
   using merge_pairs p
   where e.id = p.from_entry;

  drop table merge_pairs;

  -- --- 3. Users who have only the AniList-only copy -----------------------
  --
  -- Their entry moves to the MAL row. Left as is, it would now be a
  -- MAL-backed title that is not on their MyAnimeList list, and syncMalList
  -- reads that absence as "removed there" and deletes the entry — cascading
  -- to entry_sources. As an AniList-only title it was exempt from that, and
  -- progress edits never reached MyAnimeList, so sync_to_mal = false keeps
  -- exactly the behaviour it had. The entry page's toggle turns it back on.
  --
  -- The exception is the user whose MyAnimeList list is being synced right
  -- now: the caller found this title on that list, so it is on MAL for them
  -- and their next upsert should write MAL's progress over it as normal.
  update public.user_entries e
     set title_id    = p_into,
         sync_to_mal = case
           when p_user_on_mal is not null and e.user_id = p_user_on_mal
             then e.sync_to_mal
           else false
         end
   where e.title_id = p_from;

  -- --- 4. Collections ------------------------------------------------------
  update public.collection_items c
     set title_id = p_into
   where c.title_id = p_from
     and not exists (
       select 1 from public.collection_items x
        where x.collection_id = c.collection_id and x.title_id = p_into
     );

  delete from public.collection_items where title_id = p_from;

  -- --- 5. Tags -------------------------------------------------------------
  --
  -- Curated and personal links are deduplicated by different indexes (see
  -- 20260909000002), so each is moved against its own. What is left behind
  -- already exists on the MAL row and goes with the cascade below.
  update public.title_tags t
     set title_id = p_into
   where t.title_id = p_from
     and t.owner_id is null
     and not exists (
       select 1 from public.title_tags x
        where x.title_id = p_into and x.tag_id = t.tag_id and x.owner_id is null
     );

  update public.title_tags t
     set title_id = p_into
   where t.title_id = p_from
     and t.owner_id is not null
     and not exists (
       select 1 from public.title_tags x
        where x.title_id = p_into and x.tag_id = t.tag_id and x.owner_id = t.owner_id
     );

  -- --- 6. The catalog row --------------------------------------------------
  --
  -- AniList's names stay searchable on the surviving row.
  update public.media_titles t
     set alt_titles = coalesce((
       select array_agg(distinct name order by name)
         from unnest(
           t.alt_titles
           || v_from.alt_titles
           || array[v_from.title, v_from.title_en]
         ) as name
        where name is not null
          and name <> t.title
          and name is distinct from t.title_en
     ), '{}')
   where t.id = p_into;

  delete from public.media_titles where id = p_from;

  return true;
end;
$$;

revoke all on function private.merge_title_into(bigint, bigint, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Find and merge every duplicate among some MAL rows
-- ---------------------------------------------------------------------------
--
-- Null means the whole catalog, which is what the one-time cleanup at the end
-- of this file uses. Where AniList points two of its entries at one MAL id,
-- each AniList-only row still has exactly one MAL row to go to: the lowest id,
-- so the choice is stable across runs.

create or replace function public.merge_anilist_only_duplicates(
  p_mal_media_ids bigint[] default null,
  p_user_on_mal   uuid     default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r      record;
  merged integer := 0;
begin
  for r in
    select distinct on (a.id) a.id as from_id, m.id as into_id
      from public.media_titles m
      join public.media_titles a
        on a.media_type = m.media_type
       and a.anilist_media_id = m.anilist_media_id
       and a.mal_media_id is null
     where m.mal_media_id is not null
       and m.anilist_media_id is not null
       and (p_mal_media_ids is null or m.mal_media_id = any (p_mal_media_ids))
     order by a.id, m.id
  loop
    if private.merge_title_into(r.from_id, r.into_id, p_user_on_mal) then
      merged := merged + 1;
    end if;
  end loop;

  return merged;
end;
$$;

revoke all on function public.merge_anilist_only_duplicates(bigint[], uuid)
  from public, anon, authenticated;
grant execute on function public.merge_anilist_only_duplicates(bigint[], uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Record AniList ids on MAL rows, then merge
-- ---------------------------------------------------------------------------
--
-- What the syncs call. A pair can only be recognised once the MAL row knows
-- its AniList id, and most MAL rows are written by syncMalList, which knew
-- nothing about AniList — so both syncs now pass along the MAL-to-AniList
-- mapping they already have in hand, and this stores it and merges in one
-- round trip.
--
-- Only fills ids that are missing, like cacheAniListIds in
-- lib/sync/account-sync.ts: an id already on file was put there by the same
-- mapping and is not second-guessed here.
--
-- p_links: [{ "mal_media_id": <int>, "anilist_media_id": <int> }, ...]

create or replace function public.link_anilist_ids(
  p_links       jsonb,
  p_user_on_mal uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mal_ids bigint[];
begin
  create temporary table links on commit drop as
    select distinct on (mal_media_id) mal_media_id, anilist_media_id
      from (
        select (l ->> 'mal_media_id')::bigint     as mal_media_id,
               (l ->> 'anilist_media_id')::bigint as anilist_media_id
          from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) as l
      ) parsed
     where mal_media_id is not null
       and anilist_media_id is not null
     order by mal_media_id, anilist_media_id;

  update public.media_titles t
     set anilist_media_id = l.anilist_media_id
    from links l
   where t.media_type = 'manga'
     and t.mal_media_id = l.mal_media_id
     and t.anilist_media_id is null;

  select coalesce(array_agg(mal_media_id), '{}') into v_mal_ids from links;
  drop table links;

  if cardinality(v_mal_ids) = 0 then
    return 0;
  end if;

  return public.merge_anilist_only_duplicates(v_mal_ids, p_user_on_mal);
end;
$$;

revoke all on function public.link_anilist_ids(jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.link_anilist_ids(jsonb, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. One-time cleanup
-- ---------------------------------------------------------------------------
--
-- Merges every duplicate the catalog can already recognise — the MAL rows
-- that picked up an AniList id from an edit, an account sync or a search add.
-- The rest are found by the next MyAnimeList sync of a library that holds
-- them, which now records the AniList id as it goes.

select public.merge_anilist_only_duplicates(null, null);
