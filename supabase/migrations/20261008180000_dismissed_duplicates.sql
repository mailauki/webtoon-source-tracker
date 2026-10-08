-- Possible duplicates the user has said are not duplicates.
--
-- The Settings list and the Library notice (lib/data/duplicates.ts) match an
-- AniList-only title to a MyAnimeList one by name, and a name match can be
-- wrong. Without a way to say so, a wrong suggestion would sit in the list
-- forever. Keyed on catalog ids rather than entry ids so a dismissal survives
-- removing and re-adding either title; cascades with them, so a pair the
-- syncs later merge leaves nothing behind.
create table public.dismissed_duplicates (
  user_id          uuid   not null references public.profiles (id) on delete cascade,
  anilist_title_id bigint not null references public.media_titles (id) on delete cascade,
  mal_title_id     bigint not null references public.media_titles (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (user_id, anilist_title_id, mal_title_id)
);

-- The cascades from media_titles look rows up by these.
create index dismissed_duplicates_anilist_idx on public.dismissed_duplicates (anilist_title_id);
create index dismissed_duplicates_mal_idx on public.dismissed_duplicates (mal_title_id);

alter table public.dismissed_duplicates enable row level security;

create policy dismissed_duplicates_select_own on public.dismissed_duplicates
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy dismissed_duplicates_insert_own on public.dismissed_duplicates
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
