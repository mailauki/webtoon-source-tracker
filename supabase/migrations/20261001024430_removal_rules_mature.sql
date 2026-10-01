-- Lets a removal rule match adult-rated titles: kind 'mature', value 'adult'.
-- "Adult" is whatever lib/data/nsfw.ts's isMature says (MyAnimeList's gray and
-- black ratings), not a genre, so it needs its own kind.
alter table public.removal_rules
  drop constraint removal_rules_kind_check,
  add constraint removal_rules_kind_check
    check (kind in ('status', 'source', 'genre', 'mature'));
