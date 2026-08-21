-- Accessors for private.mal_tokens.
--
-- PostgREST can only reach schemas in the project's Exposed Schemas list, and
-- `private` is deliberately not in it — a request for that schema returns 406
-- even with the secret key. That isolation is the point, so the server reaches
-- the tokens through these SECURITY DEFINER functions instead.
--
-- Each one is locked to `service_role`: EXECUTE is revoked from PUBLIC (which
-- Postgres grants by default, and which anon/authenticated inherit), then
-- granted back to service_role alone. Without that revoke, these would be
-- public RPC endpoints handing out every user's MyAnimeList tokens.

create or replace function public.mal_tokens_get(p_user_id uuid)
returns table (access_token text, refresh_token text)
language sql
security definer
set search_path = ''
as $$
  select t.access_token, t.refresh_token
  from private.mal_tokens t
  where t.user_id = p_user_id;
$$;

revoke all on function public.mal_tokens_get(uuid) from public, anon, authenticated;
grant execute on function public.mal_tokens_get(uuid) to service_role;

create or replace function public.mal_tokens_upsert(
  p_user_id       uuid,
  p_access_token  text,
  p_refresh_token text,
  p_token_type    text default 'Bearer',
  p_expires_at    timestamptz default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.mal_tokens as t
    (user_id, access_token, refresh_token, token_type, expires_at)
  values
    (p_user_id, p_access_token, p_refresh_token, coalesce(p_token_type, 'Bearer'), p_expires_at)
  on conflict (user_id) do update set
    access_token  = excluded.access_token,
    -- Always take the new refresh token: MAL rotates it on every refresh, and
    -- keeping the old one silently kills the connection when it expires.
    refresh_token = excluded.refresh_token,
    token_type    = excluded.token_type,
    expires_at    = excluded.expires_at,
    updated_at    = now();
$$;

revoke all on function public.mal_tokens_upsert(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mal_tokens_upsert(uuid, text, text, text, timestamptz)
  to service_role;

create or replace function public.mal_tokens_delete(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.mal_tokens where user_id = p_user_id;
$$;

revoke all on function public.mal_tokens_delete(uuid) from public, anon, authenticated;
grant execute on function public.mal_tokens_delete(uuid) to service_role;
