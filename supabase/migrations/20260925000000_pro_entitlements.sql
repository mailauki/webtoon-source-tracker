-- Pro: a one-time unlock, bought on the App Store or through Stripe.
--
-- One row per Pro account, the single answer both apps read. Written only by
-- the service role (the Stripe webhook and the App Store endpoint), so there
-- are no insert/update policies: a user can read their row, never write it.
--
-- revoked_at rather than a delete: a refund turns Pro off, but the row is the
-- record of what was bought and refunded, and a later re-purchase clears it.

create table public.pro_entitlements (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  source      text not null check (source in ('grandfathered', 'app_store', 'stripe')),
  -- The store's id for the purchase: Stripe's payment intent, or the App
  -- Store's original transaction id. Null for grandfathered accounts.
  external_id text,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- One purchase unlocks one account: the same App Store transaction posted
-- from a second login must not grant a second row.
create unique index pro_entitlements_purchase_uniq
  on public.pro_entitlements (source, external_id)
  where external_id is not null;

alter table public.pro_entitlements enable row level security;

create policy pro_entitlements_select_own on public.pro_entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Takes the user id rather than reading auth.uid(): the connection triggers
-- fire under the service role, which has no auth.uid().
create or replace function private.has_pro(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.pro_entitlements
    where user_id = uid and revoked_at is null
  );
$$;

-- Everyone here before Pro existed keeps what they have.
insert into public.pro_entitlements (user_id, source)
select id, 'grandfathered' from public.profiles
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Owned chapters
-- ---------------------------------------------------------------------------
-- Refuses only a *change* that sets or edits ownership while is_owned is (or
-- becomes) true. Gated on is_owned, not on chapters_owned alone: the count
-- input stays in the form hidden-but-submitted while its box is unticked (see
-- components/source-fields.tsx), so a non-Pro user (say, after a refund) can
-- still untick Owned on a row that remembers a count -- that write carries
-- chapters_owned but must not be blocked, or ownership could never be
-- cleared. The same user can still edit the link or notes of a source
-- already marked owned.

create or replace function private.entry_sources_require_pro()
returns trigger
language plpgsql
-- Definer, like private.is_admin: it only reads, and this way the trigger
-- works under the authenticated role without schema grants on private.
security definer
set search_path = ''
as $$
begin
  if new.is_owned
     and (tg_op = 'INSERT'
          or not old.is_owned
          or new.chapters_owned is distinct from old.chapters_owned)
     and not private.has_pro(new.user_id)
  then
    raise exception 'Owned chapters are part of Pro.' using errcode = 'PT402';
  end if;
  return new;
end;
$$;

-- Named to sort after entry_sources_guard_trg, which sets user_id from the
-- entry's owner; triggers of the same timing fire in name order.
create trigger entry_sources_z_require_pro
  before insert or update on public.entry_sources
  for each row execute function private.entry_sources_require_pro();

-- ---------------------------------------------------------------------------
-- Syncing to both services
-- ---------------------------------------------------------------------------
-- Linking one of MyAnimeList / AniList is free; linking the second while the
-- first is linked is Pro. Only a transition into "linked" is checked: a
-- row that was already linked (status <> 'disconnected') stays exempt
-- through any further update -- markNeedsReauth's own update to
-- 'needs_reauth' (lib/mal/client.ts) must not itself be blocked -- and the
-- callbacks' upsert(onConflict: user_id) re-links the same service by
-- issuing a Postgres INSERT against an existing row, which is exempt the
-- same way an UPDATE would be. A disconnected -> active re-link is a real
-- transition and is still checked against the other service.

create or replace function private.connections_require_pro()
returns trigger
language plpgsql
-- Definer, like private.is_admin: it only reads, and this way the trigger
-- works under the authenticated role without schema grants on private.
security definer
set search_path = ''
as $$
declare
  already_linked boolean;
  other_linked boolean;
begin
  if new.status = 'disconnected' then
    return new;
  end if;

  -- Already linked, and staying linked, is never checked: markNeedsReauth's
  -- update to 'needs_reauth' (lib/mal/client.ts) must not itself be blocked,
  -- and the callbacks' upsert(onConflict: user_id) re-links the same service
  -- by issuing a Postgres INSERT against the existing row -- ON CONFLICT
  -- still fires the BEFORE INSERT trigger first, with that row's own
  -- user_id as new.user_id, ahead of the conflict resolving. Only a real
  -- transition into "linked" reaches the check below.
  if tg_op = 'UPDATE' then
    already_linked := old.status <> 'disconnected';
  elsif tg_table_name = 'mal_connections' then
    select exists (
      select 1 from public.mal_connections
      where user_id = new.user_id and status <> 'disconnected'
    ) into already_linked;
  else
    select exists (
      select 1 from public.anilist_connections
      where user_id = new.user_id and status <> 'disconnected'
    ) into already_linked;
  end if;

  if already_linked then
    return new;
  end if;

  if tg_table_name = 'mal_connections' then
    select exists (
      select 1 from public.anilist_connections
      where user_id = new.user_id and status <> 'disconnected'
    ) into other_linked;
  else
    select exists (
      select 1 from public.mal_connections
      where user_id = new.user_id and status <> 'disconnected'
    ) into other_linked;
  end if;

  if other_linked and not private.has_pro(new.user_id) then
    raise exception 'Syncing to both MyAnimeList and AniList is part of Pro.'
      using errcode = 'PT402';
  end if;
  return new;
end;
$$;

create trigger mal_connections_require_pro
  before insert or update of status on public.mal_connections
  for each row execute function private.connections_require_pro();

create trigger anilist_connections_require_pro
  before insert or update of status on public.anilist_connections
  for each row execute function private.connections_require_pro();
