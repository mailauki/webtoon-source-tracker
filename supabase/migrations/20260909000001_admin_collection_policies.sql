-- Admin writes on curated collections.
--
-- The existing user policies are NOT modified. Postgres ORs permissive
-- policies together, so this adds a second door that only an admin can open,
-- leaving `collections_insert_own` and its siblings exactly as they are.
--
-- Every policy here carries `owner_id is null`: admin means editorial power
-- over curated rows, never over a user's private collection. That scoping is
-- the point, not an incidental detail.
--
-- private.collection_items_guard() needs no change. It derives owner_id from
-- the parent collection, so an admin inserting into a curated collection has a
-- null owner_id written for them — exactly what these checks require.

create policy collections_insert_curated on public.collections
  for insert to authenticated
  with check (owner_id is null and private.is_admin());

create policy collections_update_curated on public.collections
  for update to authenticated
  using (owner_id is null and private.is_admin())
  with check (owner_id is null and private.is_admin());

create policy collections_delete_curated on public.collections
  for delete to authenticated
  using (owner_id is null and private.is_admin());

create policy collection_items_insert_curated on public.collection_items
  for insert to authenticated
  with check (owner_id is null and private.is_admin());

create policy collection_items_update_curated on public.collection_items
  for update to authenticated
  using (owner_id is null and private.is_admin())
  with check (owner_id is null and private.is_admin());

create policy collection_items_delete_curated on public.collection_items
  for delete to authenticated
  using (owner_id is null and private.is_admin());
