-- Reader suggestions an admin approves: a tag for a title, and one of their
-- own collections for Discover.
--
-- A suggestion is pending while its row exists. Approving applies it and
-- deletes the row; rejecting just deletes it. There is no status column
-- because nothing reads a decided suggestion.

-- ---------------------------------------------------------------------------
-- tag_suggestions
-- ---------------------------------------------------------------------------

create table public.tag_suggestions (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null default auth.uid() references public.profiles (id) on delete cascade,
  title_id   bigint not null references public.media_titles (id) on delete cascade,
  tag_id     bigint not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint tag_suggestions_uniq unique (user_id, title_id, tag_id)
);

create index tag_suggestions_title_idx on public.tag_suggestions (title_id, tag_id);
create index tag_suggestions_tag_idx on public.tag_suggestions (tag_id);

alter table public.tag_suggestions enable row level security;

create policy tag_suggestions_select on public.tag_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy tag_suggestions_insert_own on public.tag_suggestions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy tag_suggestions_delete on public.tag_suggestions
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- ---------------------------------------------------------------------------
-- collection_suggestions
-- ---------------------------------------------------------------------------

create table public.collection_suggestions (
  id            bigint generated always as identity primary key,
  -- One pending suggestion per collection.
  collection_id bigint not null unique references public.collections (id) on delete cascade,
  user_id       uuid   not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index collection_suggestions_user_idx on public.collection_suggestions (user_id);

alter table public.collection_suggestions enable row level security;

create policy collection_suggestions_select on public.collection_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- Only your own collection. collections_select_visible already hides anyone
-- else's, so the exists() cannot see one to match.
create policy collection_suggestions_insert_own on public.collection_suggestions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.collections c
      where c.id = collection_id and c.owner_id = (select auth.uid())
    )
  );

create policy collection_suggestions_delete on public.collection_suggestions
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- An admin has to see a suggested collection to judge it. Read-only, and only
-- while the suggestion is pending: no write policy on a user's collection is
-- added, so admin power over private rows stays nil.
create policy collections_select_suggested on public.collections
  for select to authenticated
  using (
    private.is_admin()
    and exists (
      select 1 from public.collection_suggestions s
      where s.collection_id = collections.id
    )
  );

create policy collection_items_select_suggested on public.collection_items
  for select to authenticated
  using (
    private.is_admin()
    and exists (
      select 1 from public.collection_suggestions s
      where s.collection_id = collection_items.collection_id
    )
  );

-- Approving copies the collection into a new curated one and clears the
-- suggestion, in one transaction. A copy rather than flipping the user's row:
-- the curated row is then the admins' to edit or retire like any other shelf,
-- and the reader's own collection stays theirs.
--
-- security invoker: every read and write below runs under the caller's RLS —
-- the select_suggested policies above and the curated-write policies from
-- 20260909000001 — so a non-admin caller gets nothing and can write nothing.
create or replace function public.approve_collection_suggestion(
  p_suggestion_id bigint,
  p_slug          text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source  public.collections;
  v_new_id  bigint;
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;

  select c.* into v_source
    from public.collection_suggestions s
    join public.collections c on c.id = s.collection_id
   where s.id = p_suggestion_id;

  if not found then
    raise exception 'suggestion % not found', p_suggestion_id
      using errcode = 'no_data_found';
  end if;

  insert into public.collections (owner_id, slug, name, description)
  values (null, p_slug, v_source.name, v_source.description)
  returning id into v_new_id;

  -- owner_id is derived by collection_items_guard: null, as curated.
  insert into public.collection_items (collection_id, title_id, position, note)
  select v_new_id, i.title_id, i.position, i.note
    from public.collection_items i
   where i.collection_id = v_source.id;

  delete from public.collection_suggestions where id = p_suggestion_id;

  return v_new_id;
end;
$$;

revoke all on function public.approve_collection_suggestion(bigint, text)
  from public, anon;
grant execute on function public.approve_collection_suggestion(bigint, text)
  to authenticated;
