-- Webtoon Source Tracker — initial schema
--
-- Accounts live in Supabase Auth. MyAnimeList is a *connection* linked to an
-- account, not a login method. The app's reason to exist is `entry_sources`:
-- which app or site a title is actually read on.
--
-- Enums are text + CHECK rather than PG enums: adding a value to a PG enum
-- cannot run inside a transaction in some contexts, which makes migrations
-- brittle. CHECK constraints are trivially alterable.

-- Into `extensions`, not `public` — Supabase's convention (uuid-ossp and
-- pgcrypto live there too), and the linter flags extensions in public.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- private schema — never exposed to PostgREST
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Shared trigger: keep updated_at honest.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users row
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Every signup (email, Google, Discord) gets a profile automatically.
-- security definer so it can write to public.profiles from the auth schema.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- mal_connections — links a Supabase account to a MyAnimeList account
-- ---------------------------------------------------------------------------

create table public.mal_connections (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  -- Globally unique: one MAL account cannot be linked to two app accounts, or
  -- two users would write conflicting progress to the same list.
  mal_user_id     bigint not null unique,
  -- Key on mal_user_id (immutable), never mal_username (users can rename).
  mal_username    text not null,
  mal_picture_url text,
  -- active        = normal
  -- disconnected  = user unlinked; data retained read-only
  -- needs_reauth  = refresh token died (>1mo idle or access revoked)
  status          text not null default 'active'
                    check (status in ('active', 'disconnected', 'needs_reauth')),
  last_synced_at  timestamptz,
  connected_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index mal_connections_mal_user_id_idx on public.mal_connections (mal_user_id);

create trigger mal_connections_touch_updated_at
  before update on public.mal_connections
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- private.mal_tokens — OAuth tokens, service-role reachable only
-- ---------------------------------------------------------------------------

create table private.mal_tokens (
  user_id       uuid primary key references public.mal_connections (user_id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  token_type    text not null default 'Bearer',
  -- Advisory only. MAL returns the *refresh* token window (~28 days) in
  -- expires_in, NOT the access token's lifetime. Never compute access-token
  -- expiry from it; refresh-on-401 is the real mechanism.
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Three independent layers keep this unreachable from the Data API:
--   1. `private` schema is not in Exposed Schemas, so PostgREST won't route.
--   2. Grants revoked from anon/authenticated.
--   3. RLS enabled with zero policies = deny all.
-- The service role bypasses RLS, which is how the server reads these.
alter table private.mal_tokens enable row level security;
revoke all on table private.mal_tokens from anon, authenticated;

create trigger mal_tokens_touch_updated_at
  before update on private.mal_tokens
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- sources — curated global catalog + per-user custom entries
-- ---------------------------------------------------------------------------

create table public.sources (
  id          bigint generated always as identity primary key,
  -- NULL owner_id = global catalog row. Non-NULL = a user's custom source.
  owner_id    uuid references public.profiles (id) on delete cascade,
  slug        text unique,
  -- Custom rows roll up under 'other' so cross-user aggregates can group by
  -- coalesce(parent_slug, slug) — a custom source counts as "Other" globally
  -- while showing its own name to its owner.
  parent_slug text references public.sources (slug),
  name        text not null,
  base_url    text,
  logo_url    text,
  is_active   boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),

  -- The two shapes are mutually exclusive: a custom row can never masquerade
  -- as a global one (and vice versa).
  constraint sources_shape_ck check (
    (owner_id is null and slug is not null and parent_slug is null)
    or
    (owner_id is not null and slug is null and parent_slug = 'other')
  ),
  constraint sources_owner_name_uniq unique (owner_id, name)
);

create index sources_owner_id_idx on public.sources (owner_id);

-- ---------------------------------------------------------------------------
-- media_entries — cached MAL list rows
-- ---------------------------------------------------------------------------

create table public.media_entries (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  -- media_type is the anime-expansion hook. v1 only ever writes 'manga'.
  media_type        text not null default 'manga'
                      check (media_type in ('manga', 'anime')),
  mal_media_id      bigint not null,

  -- MAL metadata cache, refreshed on sync
  title             text not null,
  title_en          text,
  main_picture_url  text,
  mal_media_kind    text,   -- manga | manhwa | manhua | novel | ...
  num_chapters      int,    -- 0/null = ongoing
  num_volumes       int,
  mal_status        text,   -- finished | currently_publishing | ...

  -- the user's MAL list_status, cached
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
  constraint media_entries_user_media_uniq unique (user_id, media_type, mal_media_id)
);

create index media_entries_user_id_idx      on public.media_entries (user_id);
create index media_entries_user_status_idx  on public.media_entries (user_id, list_status);
create index media_entries_user_updated_idx on public.media_entries (user_id, mal_updated_at desc);
create index media_entries_title_trgm_idx   on public.media_entries using gin (title gin_trgm_ops);

create trigger media_entries_touch_updated_at
  before update on public.media_entries
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- entry_sources — where a title is actually read (the product)
-- ---------------------------------------------------------------------------

create table public.entry_sources (
  id            bigint generated always as identity primary key,
  -- Denormalised from media_entries so RLS is a flat indexed comparison
  -- instead of a per-row join. Server-derived by trigger (see below) — this
  -- column must never be trusted from the client.
  user_id       uuid   not null references public.profiles (id) on delete cascade,
  entry_id      bigint not null references public.media_entries (id) on delete cascade,
  -- restrict, not cascade: deleting a source that's in use should raise a
  -- friendly "used by N titles" error, never silently destroy hand-entered data.
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

-- At most one primary source per entry. A plain boolean would drift.
create unique index entry_sources_one_primary_idx
  on public.entry_sources (entry_id) where is_primary;

create trigger entry_sources_touch_updated_at
  before update on public.entry_sources
  for each row execute function private.touch_updated_at();

-- Guard: derive user_id from the entry, and refuse a source the user can't use.
-- Without this, a client could insert a row pointing at someone else's
-- entry_id while setting their own user_id, and the RLS WITH CHECK would pass.
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
  from public.media_entries e
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

  -- Global sources (owner_id is null) are available to everyone; custom
  -- sources only to their owner.
  if v_owner is not null and v_owner <> new.user_id then
    raise exception 'source % is not available to this user', new.source_id
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

create trigger entry_sources_guard_trg
  before insert or update of entry_id, source_id on public.entry_sources
  for each row execute function private.entry_sources_guard();
