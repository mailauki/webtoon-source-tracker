-- Chapters owned becomes a set of ranges, not a count
--
-- `chapters_owned int` could only ever mean "1 through N". That is how the
-- coin-gated apps work — you unlock forward from where you are — but it is not
-- how a library ends up looking once more than one source is involved: the
-- Tapas app has 1–40, a print volume covers 41–54, and three chapters were
-- bought loose during a promo. A count cannot say that, and two counts on two
-- sources cannot be added, because sources overlap: owning 1–40 on both is 40
-- chapters, not 80.
--
-- int4multirange says it in one column. It is a set of integer ranges that
-- Postgres keeps canonical and non-overlapping for us — inserting
-- '{[1,41),[41,51)}' comes back as '{[1,51)}' — so the app never has to
-- normalise what it stores, and `range_agg` unions across sources correctly if
-- a query ever wants to. No new table and no new RLS policies: this rides on
-- the entry_sources ones that already exist.
--
-- Ranges are half-open on the upper bound, which is Postgres's canonical form
-- for a discrete type: chapters 1–40 is '[1,41)'. The app converts at its edges
-- (lib/data/chapter-ranges.ts) and speaks inclusive everywhere else, because
-- "1–40" is what a reader means.
--
-- Still nullable, and still for the same reason: null is "owned, not counted",
-- which is a real answer. An *empty* multirange would be a second way to say
-- nothing, so it is rejected rather than allowed to mean the same thing twice.

-- The old constraint is about an integer and cannot survive the type change.
alter table public.entry_sources
  drop constraint entry_sources_chapters_owned_nonneg;

-- A count backfills as one range starting at chapter 1, which is exactly what
-- it always meant. 40 -> {[1,41)}.
alter table public.entry_sources
  alter column chapters_owned type int4multirange
  using case
    when chapters_owned is null then null
    when chapters_owned = 0 then null
    else int4multirange(int4range(1, chapters_owned + 1))
  end;

-- Chapters are numbered from 1, and a row that owns nothing says so with null.
alter table public.entry_sources
  add constraint entry_sources_chapters_owned_shape check (
    chapters_owned is null
    or (not isempty(chapters_owned) and lower(chapters_owned) >= 1)
  );

comment on column public.entry_sources.chapters_owned is
  'Which chapters the user owns at this source, as a set of ranges (1-40 stored as [1,41)). Null means owned-but-uncounted. Independent of chapters_read: reading ahead of what you own, and buying ahead of what you have read, are both normal.';
