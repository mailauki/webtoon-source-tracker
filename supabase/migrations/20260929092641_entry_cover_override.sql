-- A reader's own choice of poster for a title.
--
-- `media_titles.main_picture_url` is the catalog's cover, shared by every
-- reader and rewritten by every sync -- so it cannot hold a preference. The
-- override lives on the reader's own row instead: null means "whatever the
-- catalog has", and anything else wins over it on every card and on the entry
-- page.
--
-- It is a URL rather than an upload. The alternatives offered (MyAnimeList's
-- other pictures, AniList's cover) are already hosted, and a custom poster is
-- a link the reader pastes. Only https is accepted: the page is served over
-- https, and a plain-http image would be blocked as mixed content and show as
-- a broken cover.
--
-- No new policy: user_entries_update_own already limits writes to the owner,
-- and the syncs never name this column, so a re-sync leaves the choice alone.
--
-- Choosing a poster is part of Pro, enforced below the same way owned
-- chapters are: a trigger raising PT402, which lib/pro.ts recognises.

alter table public.user_entries
  add column cover_url text
    constraint user_entries_cover_url_https
      check (cover_url is null or (cover_url ~ '^https://' and length(cover_url) <= 2048));

comment on column public.user_entries.cover_url is
  'The reader''s chosen poster for this title. Null falls back to media_titles.main_picture_url.';

-- ---------------------------------------------------------------------------
-- Pro
-- ---------------------------------------------------------------------------
-- Refuses only setting or changing the poster. Clearing it is always allowed,
-- so a reader who loses Pro (say, after a refund) can still go back to the
-- default; a poster already chosen keeps showing either way, as owned
-- chapters do.

create or replace function private.user_entries_cover_require_pro()
returns trigger
language plpgsql
-- Definer, like private.entry_sources_require_pro: it only reads, and this way
-- the trigger works under the authenticated role without grants on private.
security definer
set search_path = ''
as $$
begin
  if new.cover_url is not null
     and (tg_op = 'INSERT' or new.cover_url is distinct from old.cover_url)
     and not private.has_pro(new.user_id)
  then
    raise exception 'Custom posters are part of Pro.' using errcode = 'PT402';
  end if;
  return new;
end;
$$;

-- Scoped to the column, so the syncs' and the progress form's updates -- which
-- never name it -- do not pay for the entitlement lookup.
create trigger user_entries_cover_require_pro
  before insert or update of cover_url on public.user_entries
  for each row execute function private.user_entries_cover_require_pro();
