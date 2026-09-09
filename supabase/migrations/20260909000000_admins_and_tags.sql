-- Admin capability, and the tag vocabulary it manages.
--
-- The admins table has no insert, update, or delete policy, and that absence
-- IS the security model: RLS denies by default, so no request carrying a
-- user's JWT can grant admin — not a forged one, not a bug in a route
-- handler. Rows are written by the service role only, via
-- `yarn grant:admin <email>`.
--
-- This is the same reasoning that makes curated collections unwritable today:
-- safety from the absence of a permitting policy, rather than from a check
-- somebody has to remember to write.
--
-- `role` lives here rather than on `profiles` so there is exactly one door.
-- Two independent grants would mean two places to audit and a revocation that
-- is easy to half-finish.

create table public.admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  -- Nothing reads this yet. It exists so 'editor' can be distinguished from
  -- 'admin' later without a new table.
  role       text not null default 'admin' check (role in ('admin', 'editor')),
  granted_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- An admin may confirm their own row, which is how the UI asks "am I one".
-- Deliberately not `using (true)`: the roster is not public.
create policy admins_select_self on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policy. See the header comment.

-- security definer so policies need not grant callers select on other rows of
-- admins. stable so the planner calls it once per statement, not per row.
create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
-- Tags are a table, not free text on the join row. Strings become "Enemies to
-- Lovers", "enemies to lovers" and "Enemies-to-Lovers" within a month, and
-- renaming one would mean rewriting every row. A table makes rename a one-row
-- update and gives each tag a slug, a description and a page.

create table public.tags (
  id           bigint generated always as identity primary key,
  slug         text not null unique,
  name         text not null,
  description  text,
  -- Lets "Romance" (a genre MAL knows) and "Enemies to Lovers" (a trope it
  -- does not) live in one table and be grouped separately in the UI.
  kind         text not null default 'trope'
                 check (kind in ('genre', 'trope', 'theme', 'format')),
  -- Provenance, NOT a sync target. Records which MAL genre first caused this
  -- row to exist; null for tags invented here. Sync inserts with
  -- `on conflict (mal_genre_id) do nothing`, so MAL can bring a tag into
  -- existence and can never modify one that exists. That is what makes a
  -- locally renamed tag survive every later sync, and why there is no
  -- display_name shadow column and no read-only class of tag.
  mal_genre_id bigint unique,
  sort_order   int not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tags_kind_idx on public.tags (kind, sort_order);

create trigger tags_touch_updated_at
  before update on public.tags
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- title_tags
-- ---------------------------------------------------------------------------

create table public.title_tags (
  id         bigint generated always as identity primary key,
  -- cascade, unlike collection_items.title_id which restricts. A tag is an
  -- annotation, and losing an annotation when its subject disappears is
  -- correct. A collection item is content somebody assembled, so it blocks
  -- the delete instead.
  title_id   bigint not null references public.media_titles (id) on delete cascade,
  tag_id     bigint not null references public.tags (id) on delete cascade,
  -- Always null for now: curated, global. Nullable from the start so private
  -- user tags are a policy change later rather than a table rewrite.
  owner_id   uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Postgres treats NULLs as distinct, so this already permits one curated row
  -- plus one private row per user per title.
  constraint title_tags_uniq unique (title_id, tag_id, owner_id)
);

create index title_tags_title_idx on public.title_tags (title_id);
create index title_tags_tag_idx   on public.title_tags (tag_id);
create index title_tags_owner_idx on public.title_tags (owner_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tags       enable row level security;
alter table public.title_tags enable row level security;

-- Readable by every signed-in user. is_active is presentation and is filtered
-- by the data layer, not here — the same call collections makes.
create policy tags_select_all on public.tags
  for select to authenticated
  using (true);

create policy tags_insert_admin on public.tags
  for insert to authenticated
  with check (private.is_admin());

create policy tags_update_admin on public.tags
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy tags_delete_admin on public.tags
  for delete to authenticated
  using (private.is_admin());

-- Curated rows (null owner) are visible to all; a private row, when that
-- feature lands, is visible only to its owner.
create policy title_tags_select_visible on public.title_tags
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy title_tags_insert_admin on public.title_tags
  for insert to authenticated
  with check (owner_id is null and private.is_admin());

create policy title_tags_delete_admin on public.title_tags
  for delete to authenticated
  using (owner_id is null and private.is_admin());
