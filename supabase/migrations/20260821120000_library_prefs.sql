-- Sticky library filters
--
-- The status/source chips on /library used to reset to "All" on every visit,
-- because their only state was `?status=` / `?source=` in the URL. This table
-- remembers the last choice so returning to the library resumes where the
-- user left off.
--
-- Both columns are nullable and mean "no preference" when null. That is
-- distinct from the string 'all', which the UI stores when the user
-- explicitly asks to see everything — otherwise picking "All" would be
-- indistinguishable from never having chosen, and the previous filter would
-- come back on the next visit.
--
-- Values are not FK'd or CHECK'd against the status list on purpose: a stale
-- preference (a status MAL later renames, a custom source the user deletes)
-- should quietly show nothing rather than break the page or fail the write.

create table public.library_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  status     text,
  source     text,
  updated_at timestamptz not null default now()
);

create trigger library_prefs_touch_updated_at
  before update on public.library_prefs
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — self only
-- ---------------------------------------------------------------------------
-- Unlike profiles, this table DOES need an insert policy: there is no signup
-- trigger creating the row. It is written lazily, by upsert, the first time
-- the user touches a filter.
--
-- No delete policy: rows carry no value worth removing on their own, and they
-- cascade with the profile.

alter table public.library_prefs enable row level security;

create policy library_prefs_select_own on public.library_prefs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy library_prefs_insert_own on public.library_prefs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy library_prefs_update_own on public.library_prefs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
