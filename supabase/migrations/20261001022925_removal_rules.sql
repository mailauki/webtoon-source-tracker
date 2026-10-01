-- Standing rules that take titles off the shelf, and optionally off
-- MyAnimeList and AniList, by status, source or genre.
--
-- A rule applies to every title that matches it, now and later: the app runs
-- the rules when one is created, after every sync, and whenever an edit could
-- make a title match (a status change, a source attached). See
-- lib/entries/removal-rules.ts.
--
-- One criterion per rule. `value` is read by `kind`: a MAL list status for
-- `status`, a sources.id for `source`, a tags.id (kind 'genre') for `genre`.
-- Several rules combine as OR.
create table public.removal_rules (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('status', 'source', 'genre')),
  value        text not null,
  -- The same three targets as the remove dialog. The two sites delete for
  -- good, which is why the settings form says so before a rule is saved.
  from_library boolean not null default true,
  from_mal     boolean not null default false,
  from_anilist boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint removal_rules_some_target
    check (from_library or from_mal or from_anilist),
  constraint removal_rules_uniq unique (user_id, kind, value)
);

alter table public.removal_rules enable row level security;

create policy removal_rules_select_own on public.removal_rules
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy removal_rules_insert_own on public.removal_rules
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy removal_rules_delete_own on public.removal_rules
  for delete to authenticated
  using ((select auth.uid()) = user_id);
