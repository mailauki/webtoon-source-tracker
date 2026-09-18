-- Owned / purchased, per source
--
-- Ownership is a fact about a *copy*, not about a title: buying the Tapas
-- volumes does not give you the chapters on Webtoon, and unlocking coins on
-- one app buys nothing on another. So this hangs off entry_sources for the
-- same reason is_hiatus does — the interesting statement is "I own this
-- here", and there is no title-level answer that is not a lossy summary of
-- the per-source ones.
--
-- Distinct from `is_paid`, which is easy to conflate. `is_paid` describes the
-- *source*: this site charges for chapters. `is_owned` describes the user's
-- relationship to it: they have paid. A paid source you have not bought from
-- is is_paid && !is_owned, which is exactly the "what should I spend coins
-- on" case the library toggle exists to answer — so the two cannot be folded
-- into one column.
--
-- `chapters_owned` is a count, not a set of chapter numbers. Webtoon, Tapas
-- and Piccoma all unlock forward from where you are: you spend coins on the
-- next chapter, not an arbitrary one, so "40 unlocked" says everything a list
-- of forty rows would, in one int, with no join. A separate table only starts
-- paying for itself if non-contiguous ownership turns out to be common
-- (a gifted chapter, a bought volume mid-series), and nothing in the app
-- records that today.
--
-- Nullable, like chapters_read, and for the same reason: "I own this, I have
-- not counted how much of it" is a real answer, and 0 would claim the user
-- owns nothing here. Deliberately NOT constrained against chapters_read —
-- reading further than you have bought is normal (a friend's account, a
-- scanlation caught up past the paywall), and so is buying ahead of where you
-- have read.
--
-- Defaults false/null, so the backfill for existing rows is a no-op.
--
-- No index, matching is_hiatus: these are read off rows the library query has
-- already fetched and filtered in the browser (see components/library-grid.tsx),
-- so nothing queries on them alone.

alter table public.entry_sources
  add column is_owned      boolean not null default false,
  add column chapters_owned int,
  add constraint entry_sources_chapters_owned_nonneg
    check (chapters_owned is null or chapters_owned >= 0);

comment on column public.entry_sources.is_owned is
  'The user has bought or otherwise owns this title at this source. Distinct from is_paid, which says the source charges money — not that the user has paid it.';

comment on column public.entry_sources.chapters_owned is
  'How many chapters the user owns at this source, counting forward from the first. Null means owned-but-uncounted. Independent of chapters_read: reading ahead of what you own, and buying ahead of what you have read, are both normal.';
