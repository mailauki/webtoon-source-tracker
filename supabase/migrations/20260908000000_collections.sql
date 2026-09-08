-- Collections — named groupings of titles
--
-- Two shapes in one table, the same idiom `sources` already uses:
--
--   owner_id is null      curated: editorial, global, readable by everyone
--   owner_id is not null  a user's own collection, private to them
--
-- Sharing this table (rather than splitting curated and user collections into
-- two) means one item table, one set of policies, and one render path. It also
-- means curated rows are structurally unwritable by users: the insert policy
-- requires `owner_id = auth.uid()`, and `null` never equals a uuid. Curated
-- rows are seeded through the service role, exactly like `sources`.
--
-- Items point at `media_titles`, NOT `user_entries`. This is the load-bearing
-- decision here:
--
--   * A curated collection has to be able to list a title nobody tracks. If
--     items hung off `user_entries` there could be no such thing.
--   * `lib/sync/sync-list.ts` hard-deletes entries MAL no longer knows about
--     (see TODO(soft-delete)), cascading through `entry_sources`. Hanging
--     items off `user_entries` would let a MAL-side removal silently empty a
--     collection the user built by hand. `user_entries -> media_titles` is
--     `on delete restrict`, so catalog rows never vanish underneath an item.
--
-- The consequence to design for: a collection can contain a title that is not
-- on the viewer's shelf. Rendering is a left join onto `user_entries` — on the
-- shelf, show progress and sources; not on the shelf, offer to add it. For a
-- curated collection that second state is the entire point.
--
-- Deliberately not here: visibility/sharing. The moment a collection is
-- shareable it needs a non-enumerable public identifier, a report path, and
-- moderation. Adding a `visibility` column later is a small migration;
-- retrofitting the rest is not. Everything a user makes is private for now.

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------

create table public.collections (
  id          bigint generated always as identity primary key,
  -- NULL = curated global row. Non-NULL = a user's own collection.
  owner_id    uuid references public.profiles (id) on delete cascade,
  -- Curated rows only: the stable editorial handle, so a curated collection
  -- can be linked to and reseeded without depending on its surrogate id.
  slug        text unique,
  name        text not null,
  description text,
  -- Curated ordering on the collections index. User rows all share the
  -- default and order by name.
  sort_order  int not null default 100,
  -- Retire a curated collection without deleting it (and its items) outright.
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The two shapes are mutually exclusive: a user collection can never
  -- masquerade as a curated one by claiming a slug.
  constraint collections_shape_ck check (
    (owner_id is null and slug is not null)
    or
    (owner_id is not null and slug is null)
  ),
  -- Scoped per owner, so two users may both have a "Comfort rereads". Note
  -- this does NOT constrain curated rows: Postgres treats NULLs as distinct,
  -- so every curated row satisfies it trivially. `slug` is what keeps those
  -- unique — the same trade `sources_owner_name_uniq` makes.
  constraint collections_owner_name_uniq unique (owner_id, name)
);

create index collections_owner_id_idx on public.collections (owner_id);

create trigger collections_touch_updated_at
  before update on public.collections
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- collection_items
-- ---------------------------------------------------------------------------

create table public.collection_items (
  id            bigint generated always as identity primary key,
  collection_id bigint not null references public.collections (id) on delete cascade,
  -- Denormalised from the parent collection so RLS is a flat indexed
  -- comparison instead of a per-row join — the same reason `entry_sources`
  -- carries `user_id`. Server-derived by trigger (see below); never trust it
  -- from the client. NULL on the items of a curated collection.
  owner_id      uuid   references public.profiles (id) on delete cascade,
  -- restrict, not cascade: a catalog row must not be deletable while a
  -- collection points at it.
  title_id      bigint not null references public.media_titles (id) on delete restrict,

  -- Manual ordering within the collection. Deliberately NOT unique: reordering
  -- against a unique index requires a deferrable constraint or a pass through
  -- temporary negative values. Reorders rewrite every position in the
  -- collection in one statement, and created_at breaks ties in between.
  position      int not null default 0,
  -- Why this title is in this collection ("the one that got me into manhwa").
  note          text,

  created_at    timestamptz not null default now(),

  constraint collection_items_uniq unique (collection_id, title_id)
);

create index collection_items_collection_idx
  on public.collection_items (collection_id, position, created_at);
create index collection_items_owner_id_idx on public.collection_items (owner_id);
create index collection_items_title_id_idx on public.collection_items (title_id);

-- Guard: derive owner_id from the parent collection.
--
-- Without this a client could insert a row pointing at someone else's
-- collection_id while setting their own owner_id, and the RLS WITH CHECK would
-- pass — the same hole `private.entry_sources_guard` closes for entry_sources.
--
-- Curated collections need no special case: their owner_id is null, so the row
-- this writes has a null owner_id, and the insert policy's
-- `owner_id = auth.uid()` is null rather than true. Users are structurally
-- unable to add to a curated collection. The service role bypasses RLS, which
-- is how curated items get seeded.
create or replace function private.collection_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- FOUND, not `new.owner_id is null`: a curated collection legitimately has a
  -- null owner, so the null tells us nothing about whether the row exists.
  select c.owner_id into new.owner_id
  from public.collections c
  where c.id = new.collection_id;

  if not found then
    raise exception 'collection % not found', new.collection_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end $$;

-- owner_id is in the update list so that an attempt to rewrite it re-derives
-- from the parent rather than being taken at face value.
create trigger collection_items_guard_trg
  before insert or update of collection_id, owner_id on public.collection_items
  for each row execute function private.collection_items_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Same conventions as everywhere else: `to authenticated` rather than
-- auth.role(), `(select auth.uid())` so it is evaluated once per statement,
-- and both using and with check on every update.

alter table public.collections      enable row level security;
alter table public.collection_items enable row level security;

-- Curated collections are readable by everyone; user collections only by
-- their owner. Retired curated rows stay visible to the service role and are
-- filtered by the data layer, not here — is_active is presentation, not authz.
create policy collections_select_visible on public.collections
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy collections_insert_own on public.collections
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy collections_update_own on public.collections
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy collections_delete_own on public.collections
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Items inherit the visibility of their collection, which the denormalised
-- owner_id already encodes.
create policy collection_items_select_visible on public.collection_items
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy collection_items_insert_own on public.collection_items
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy collection_items_update_own on public.collection_items
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy collection_items_delete_own on public.collection_items
  for delete to authenticated
  using (owner_id = (select auth.uid()));
