-- Let the catalog hold a title MyAnimeList does not have.
--
-- media_titles assumed every title exists on MAL: `mal_media_id` was NOT NULL
-- and the only unique key. That was true while MAL was the sole catalog. The
-- cross-catalog search now finds titles AniList has and MAL does not, and
-- there was no key to store them under, so they could be shown but never
-- added.
--
-- What this does NOT change: MyAnimeList stays the source of truth for every
-- title that exists on it. An AniList-only row is the exception, and the
-- application code treats it as one — see the guards in lib/sync/sync-list.ts,
-- which must never delete a row MAL was never going to return.

-- ---------------------------------------------------------------------------
-- 1. mal_media_id becomes optional
-- ---------------------------------------------------------------------------

alter table public.media_titles
  alter column mal_media_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. Uniqueness, restated for a nullable column
-- ---------------------------------------------------------------------------
--
-- `unique (media_type, mal_media_id)` stops protecting anything once the
-- column is nullable: in Postgres NULL is never equal to NULL, so any number
-- of AniList-only rows would satisfy it and the catalog would accumulate
-- duplicates of the same title.
--
-- Replaced by two partial unique indexes, each covering the rows that actually
-- have the id in question. `upsert(..., onConflict: 'media_type,mal_media_id')`
-- keeps working against the first: PostgREST names the columns, and a partial
-- index with a matching predicate is a valid arbiter for the MAL rows, which
-- are the only rows that upsert ever writes.

alter table public.media_titles
  drop constraint media_titles_mal_uniq;

create unique index media_titles_mal_uniq
  on public.media_titles (media_type, mal_media_id)
  where mal_media_id is not null;

-- AniList-only rows need their own key, or the same title added twice by two
-- users would land twice. Deliberately partial rather than a plain unique on
-- anilist_media_id: a MAL-backed row caches the same AniList id, and AniList
-- occasionally points two of its entries at one MAL id, so a total constraint
-- would turn that upstream quirk into a failed write. The existing
-- media_titles_anilist_media_id_idx stays; it serves lookups, not uniqueness.

create unique index media_titles_anilist_only_uniq
  on public.media_titles (media_type, anilist_media_id)
  where mal_media_id is null and anilist_media_id is not null;

-- ---------------------------------------------------------------------------
-- 3. A row must be reachable by at least one catalog
-- ---------------------------------------------------------------------------
--
-- Without this, a row with neither id is insertable and then unreachable: it
-- can never be matched by a sync, a search or a mirror, and nothing would ever
-- clean it up. The check is what makes "nullable" mean "one or the other"
-- rather than "optional".

alter table public.media_titles
  add constraint media_titles_has_catalog_id
  check (mal_media_id is not null or anilist_media_id is not null);
