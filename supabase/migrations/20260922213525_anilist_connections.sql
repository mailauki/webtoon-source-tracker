-- AniList as a second connection, alongside MyAnimeList.
--
-- The shape deliberately mirrors mal_connections / private.mal_tokens: AniList
-- is a *connection* linked to an account, never a login method, and its
-- tokens live in the unexposed `private` schema behind service-role-only RPCs.
--
-- MyAnimeList stays the library's source of truth. AniList is kept in step
-- with it — progress edits are mirrored there, and the account sync in
-- lib/sync/account-sync.ts reconciles the two lists — but the local cache
-- still only ever mirrors MAL, so none of the sync's removal guards change.

-- ---------------------------------------------------------------------------
-- anilist_connections — links a Supabase account to an AniList account
-- ---------------------------------------------------------------------------

create table public.anilist_connections (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  -- Globally unique for the same reason mal_user_id is: two app accounts
  -- writing to one AniList list would overwrite each other's progress.
  anilist_user_id     bigint not null unique,
  -- Key on anilist_user_id (immutable), never the username (renamable).
  anilist_username    text not null,
  anilist_avatar_url  text,
  -- active        = normal
  -- disconnected  = user unlinked
  -- needs_reauth  = token expired (AniList tokens last a year) or revoked
  status              text not null default 'active'
                        check (status in ('active', 'disconnected', 'needs_reauth')),
  -- When the two accounts were last reconciled by the account sync.
  last_synced_at      timestamptz,
  connected_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger anilist_connections_touch_updated_at
  before update on public.anilist_connections
  for each row execute function private.touch_updated_at();

-- Same policy set as mal_connections: read and unlink your own row. Writes go
-- through the server with the secret key, because they need the OAuth result.
alter table public.anilist_connections enable row level security;

create policy anilist_connections_select_own on public.anilist_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy anilist_connections_delete_own on public.anilist_connections
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- private.anilist_tokens — OAuth token, service-role reachable only
-- ---------------------------------------------------------------------------

create table private.anilist_tokens (
  user_id       uuid primary key references public.anilist_connections (user_id) on delete cascade,
  access_token  text not null,
  token_type    text not null default 'Bearer',
  -- Unlike MAL's, this one is real: AniList access tokens are valid for a
  -- year and there is no refresh grant, so expiry means reconnecting.
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The same three layers as private.mal_tokens: unexposed schema, revoked
-- grants, and RLS with zero policies.
alter table private.anilist_tokens enable row level security;
revoke all on table private.anilist_tokens from anon, authenticated;

create trigger anilist_tokens_touch_updated_at
  before update on private.anilist_tokens
  for each row execute function private.touch_updated_at();

create or replace function public.anilist_tokens_get(p_user_id uuid)
returns table (access_token text, expires_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select t.access_token, t.expires_at
  from private.anilist_tokens t
  where t.user_id = p_user_id;
$$;

revoke all on function public.anilist_tokens_get(uuid) from public, anon, authenticated;
grant execute on function public.anilist_tokens_get(uuid) to service_role;

create or replace function public.anilist_tokens_upsert(
  p_user_id      uuid,
  p_access_token text,
  p_token_type   text default 'Bearer',
  p_expires_at   timestamptz default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.anilist_tokens as t
    (user_id, access_token, token_type, expires_at)
  values
    (p_user_id, p_access_token, coalesce(p_token_type, 'Bearer'), p_expires_at)
  on conflict (user_id) do update set
    access_token = excluded.access_token,
    token_type   = excluded.token_type,
    expires_at   = excluded.expires_at,
    updated_at   = now();
$$;

revoke all on function public.anilist_tokens_upsert(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.anilist_tokens_upsert(uuid, text, text, timestamptz)
  to service_role;

create or replace function public.anilist_tokens_delete(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.anilist_tokens where user_id = p_user_id;
$$;

revoke all on function public.anilist_tokens_delete(uuid) from public, anon, authenticated;
grant execute on function public.anilist_tokens_delete(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- media_titles.anilist_media_id — the AniList id for a MAL title
-- ---------------------------------------------------------------------------
--
-- A cache of AniList's own `idMal` mapping, filled in the first time a title
-- is mirrored or synced, so later writes skip the lookup. Nullable: most rows
-- are written by the MAL sync, which knows nothing about AniList.
--
-- Not unique. AniList occasionally points two of its entries at one MAL id
-- (and vice versa), and a constraint here would turn that upstream quirk into
-- a failed sync rather than a slightly stale cache entry.

alter table public.media_titles add column anilist_media_id bigint;

create index media_titles_anilist_media_id_idx
  on public.media_titles (anilist_media_id)
  where anilist_media_id is not null;
