-- Type tags: Manga, Manhwa, Manhua and the rest, as browsable categories.
--
-- Every title already knows its type — media_titles.mal_media_kind, which MAL
-- sends as `media_type` and AniList as `format` — so these tags are derived
-- rather than curated. A trigger keeps the link in step with the column,
-- because three paths write catalog rows (the list sync, add-entry, and the
-- AniList upsert RPC) and a trigger is the one place all of them pass through.
--
-- The slug is the kind with `_` as `-`, which is what joins the two. AniList
-- has no manhwa or manhua format — it splits by country instead — so an
-- AniList-only title lands under Manga whatever its origin.

insert into public.tags (slug, name, kind, sort_order) values
  ('manga',       'Manga',       'format', 10),
  ('manhwa',      'Manhwa',      'format', 20),
  ('manhua',      'Manhua',      'format', 30),
  ('oel',         'OEL',         'format', 40),
  ('light-novel', 'Light Novel', 'format', 50),
  ('novel',       'Novel',       'format', 60),
  ('one-shot',    'One-shot',    'format', 70),
  ('doujinshi',   'Doujinshi',   'format', 80)
on conflict (slug) do nothing;

-- Security definer: the AniList RPC and add-entry write media_titles as the
-- signed-in user, and title_tags only takes curated inserts from an admin.
create function private.tag_media_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.mal_media_kind is not distinct from new.mal_media_kind then
      return null;
    end if;
    -- The kind changed, so the old type's link is now wrong.
    delete from public.title_tags tt
      using public.tags t
     where tt.title_id = new.id
       and tt.owner_id is null
       and tt.tag_id = t.id
       and t.slug = replace(old.mal_media_kind, '_', '-');
  end if;

  insert into public.title_tags (title_id, tag_id, owner_id)
  select new.id, t.id, null
    from public.tags t
   where t.slug = replace(new.mal_media_kind, '_', '-')
  on conflict (title_id, tag_id) where owner_id is null do nothing;

  return null;
end;
$$;

create trigger media_titles_tag_media_kind
  after insert or update of mal_media_kind on public.media_titles
  for each row execute function private.tag_media_kind();

-- Backfill every title already in the catalog.
insert into public.title_tags (title_id, tag_id, owner_id)
select m.id, t.id, null
  from public.media_titles m
  join public.tags t on t.slug = replace(m.mal_media_kind, '_', '-')
on conflict (title_id, tag_id) where owner_id is null do nothing;
