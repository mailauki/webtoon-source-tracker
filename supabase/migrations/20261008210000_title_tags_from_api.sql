-- Genres a title gets from MyAnimeList or AniList can't be taken off it.
--
-- from_api marks a curated link the syncs (or the format trigger) wrote. It
-- defaults to TRUE so every writer that doesn't know about it — syncGenres,
-- scripts/backfill-genres.ts, private.tag_media_kind — is marked as the API
-- without a change. The only by-hand writers (tagTitle and an approved tag
-- suggestion) send false, and the insert policy below insists on it, so a
-- request carrying a user's JWT can never mint a locked row.
--
-- A by-hand link the API later also gives stays unlocked: the sync sees the
-- link exists and skips it. Removing it is harmless — the next sync puts it
-- back, locked.

alter table public.title_tags
  add column from_api boolean not null default false;

-- Best guess for rows written before provenance existed: a tag MAL created
-- (mal_genre_id) or a format is the API's; anything else was added by hand.
update public.title_tags tt
   set from_api = true
  from public.tags t
 where t.id = tt.tag_id
   and tt.owner_id is null
   and (t.mal_genre_id is not null or t.kind = 'format');

alter table public.title_tags
  alter column from_api set default true;

drop policy title_tags_insert_admin on public.title_tags;
create policy title_tags_insert_admin on public.title_tags
  for insert to authenticated
  with check (owner_id is null and not from_api and private.is_admin());

drop policy title_tags_delete_admin on public.title_tags;
create policy title_tags_delete_admin on public.title_tags
  for delete to authenticated
  using (owner_id is null and not from_api and private.is_admin());
