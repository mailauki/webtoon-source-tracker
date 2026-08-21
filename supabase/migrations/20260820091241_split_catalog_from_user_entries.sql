-- Split media_entries into a shared catalog + per-user progress.
--
-- media_entries conflated two different things: a title's identity (Solo
-- Leveling, its cover, its chapter count) and one user's relationship to it
-- (reading, chapter 42). That meant every user tracking the same title stored
-- a duplicate copy of its metadata.
--
-- After the split:
--   media_titles  — shared catalog, one row per MAL title, owned by nobody
--   user_entries  — one row per (user, title): status, progress, score
--   entry_sources — unchanged in spirit; now hangs off user_entries
--
-- Measured on representative data: at 500 users x 300 titles this is ~58%
-- smaller than the denormalised version (19 MB vs 45 MB), because the title
-- metadata is stored once instead of once per user.
--
-- Safe to drop and recreate: applied while the database had zero rows.

drop table if exists public.entry_sources cascade;
drop table if exists public.media_entries cascade;

-- ---------------------------------------------------------------------------
-- media_titles — the shared catalog
-- ---------------------------------------------------------------------------

create table public.media_titles (
  id               bigint generated always as identity primary key,
  -- media_type is the anime-expansion hook; v1 only ever writes 'manga'.
  media_type       text not null default 'manga'
                     check (media_type in ('manga', 'anime')),
  mal_media_id     bigint not null,

  title            text not null,
  title_en         text,
  main_picture_url text,
  mal_media_kind   text,   -- manga | manhwa | manhua | novel | ...
  num_chapters     int,    -- 0/null = ongoing
  num_volumes      int,
  mal_status       text,   -- finished | currently_publishing | ...

  -- When this row's metadata was last refreshed from MAL. Independent of any
  -- user's sync, since the row outlives any individual user's interest.
  synced_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint media_titles_mal_uniq unique (media_type, mal_media_id)
);

create index media_titles_title_trgm_idx
  on public.media_titles using gin (title extensions.gin_trgm_ops);

create trigger media_titles_touch_updated_at
  before update on public.media_titles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- user_entries — one user's relationship to a title
-- ---------------------------------------------------------------------------

create table public.user_entries (
  id                bigint generated always as identity primary key,
  user_id           uuid   not null references public.profiles (id) on delete cascade,
  -- restrict, not cascade: a catalog row must not be deletable while someone
  -- is tracking it. Catalog rows are shared, so removing one would silently
  -- destroy other users' entries.
  title_id          bigint not null references public.media_titles (id) on delete restrict,

  list_status       text not null
                      check (list_status in ('reading', 'completed', 'on_hold',
                                             'dropped', 'plan_to_read')),
  num_chapters_read int not null default 0 check (num_chapters_read >= 0),
  num_volumes_read  int not null default 0 check (num_volumes_read >= 0),
  score             int not null default 0 check (score between 0 and 10),
  is_rereading      boolean not null default false,
  mal_updated_at    timestamptz,

  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Upsert conflict target for sync.
  constraint user_entries_user_title_uniq unique (user_id, title_id)
);

create index user_entries_user_id_idx      on public.user_entries (user_id);
create index user_entries_user_status_idx  on public.user_entries (user_id, list_status);
create index user_entries_user_updated_idx on public.user_entries (user_id, mal_updated_at desc);
create index user_entries_title_id_idx     on public.user_entries (title_id);

create trigger user_entries_touch_updated_at
  before update on public.user_entries
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- entry_sources — where this user reads this title (the product)
-- ---------------------------------------------------------------------------

create table public.entry_sources (
  id            bigint generated always as identity primary key,
  -- Denormalised from user_entries so RLS is a flat indexed comparison rather
  -- than a per-row join. Server-derived by trigger — never trust the client.
  user_id       uuid   not null references public.profiles (id) on delete cascade,
  entry_id      bigint not null references public.user_entries (id) on delete cascade,
  source_id     bigint not null references public.sources (id) on delete restrict,

  url           text,
  chapters_read int,
  is_primary    boolean not null default false,
  is_official   boolean not null default true,
  is_paid       boolean not null default false,
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint entry_sources_entry_source_uniq unique (entry_id, source_id),
  constraint entry_sources_chapters_nonneg
    check (chapters_read is null or chapters_read >= 0)
);

create index entry_sources_user_id_idx     on public.entry_sources (user_id);
create index entry_sources_entry_id_idx    on public.entry_sources (entry_id);
create index entry_sources_user_source_idx on public.entry_sources (user_id, source_id);

create unique index entry_sources_one_primary_idx
  on public.entry_sources (entry_id) where is_primary;

create trigger entry_sources_touch_updated_at
  before update on public.entry_sources
  for each row execute function private.touch_updated_at();

-- Same guard as before, repointed at user_entries: derive user_id from the
-- entry, and refuse a custom source belonging to someone else.
create or replace function private.entry_sources_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select e.user_id into new.user_id
  from public.user_entries e
  where e.id = new.entry_id;

  if new.user_id is null then
    raise exception 'entry % not found', new.entry_id
      using errcode = 'foreign_key_violation';
  end if;

  select s.owner_id into v_owner
  from public.sources s
  where s.id = new.source_id;

  if not found then
    raise exception 'source % not found', new.source_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_owner is not null and v_owner <> new.user_id then
    raise exception 'source % is not available to this user', new.source_id
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

create trigger entry_sources_guard_trg
  before insert or update of entry_id, source_id on public.entry_sources
  for each row execute function private.entry_sources_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.media_titles  enable row level security;
alter table public.user_entries  enable row level security;
alter table public.entry_sources enable row level security;

-- The catalog is shared: any signed-in user may read any title. Writes go
-- through the service role during sync, so there are no write policies —
-- users cannot edit shared metadata.
create policy media_titles_select_all on public.media_titles
  for select to authenticated
  using (true);

create policy user_entries_select_own on public.user_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_entries_insert_own on public.user_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_entries_update_own on public.user_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_entries_delete_own on public.user_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy entry_sources_select_own on public.entry_sources
  for select to authenticated using ((select auth.uid()) = user_id);
create policy entry_sources_insert_own on public.entry_sources
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy entry_sources_update_own on public.entry_sources
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy entry_sources_delete_own on public.entry_sources
  for delete to authenticated using ((select auth.uid()) = user_id);
