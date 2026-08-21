-- Row Level Security
--
-- Conventions applied throughout:
--   * `TO authenticated` — never auth.role() (deprecated, and anonymous users
--     carry the authenticated Postgres role, so it silently over-grants).
--   * `(select auth.uid())` in a subquery — lets Postgres evaluate it once
--     per statement instead of per row (5-10x on large scans).
--   * UPDATE policies carry BOTH using and with check — without with check a
--     user can reassign a row's user_id to someone else.
--   * No policy reads user_metadata: it is user-writable and unsafe for authz.

alter table public.profiles        enable row level security;
alter table public.mal_connections enable row level security;
alter table public.sources         enable row level security;
alter table public.media_entries   enable row level security;
alter table public.entry_sources   enable row level security;

-- ---------------------------------------------------------------------------
-- profiles — self only
-- ---------------------------------------------------------------------------
-- No INSERT policy: rows are created by the on_auth_user_created trigger.
-- No DELETE policy: removal cascades from auth.users.

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- mal_connections — read + unlink own
-- ---------------------------------------------------------------------------
-- Insert/update go through the server with the secret key (which bypasses
-- RLS), because writing them requires the OAuth exchange result.

create policy mal_connections_select_own on public.mal_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy mal_connections_delete_own on public.mal_connections
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- sources — global catalog readable by all; custom rows private to owner
-- ---------------------------------------------------------------------------

create policy sources_select_visible on public.sources
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

-- Users may only ever write rows they own. Because `owner_id is null` can
-- never equal auth.uid(), the global catalog is structurally unwritable by
-- users — no separate guard needed. Seeding happens via the service role.
create policy sources_insert_own_custom on public.sources
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy sources_update_own_custom on public.sources
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy sources_delete_own_custom on public.sources
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- media_entries — full ownership
-- ---------------------------------------------------------------------------

create policy media_entries_select_own on public.media_entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy media_entries_insert_own on public.media_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy media_entries_update_own on public.media_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy media_entries_delete_own on public.media_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- entry_sources — full ownership
-- ---------------------------------------------------------------------------
-- The with check is belt-and-braces: entry_sources_guard_trg already forces
-- user_id to the entry's owner before the check runs.

create policy entry_sources_select_own on public.entry_sources
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy entry_sources_insert_own on public.entry_sources
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy entry_sources_update_own on public.entry_sources
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy entry_sources_delete_own on public.entry_sources
  for delete to authenticated
  using ((select auth.uid()) = user_id);
