-- The theme a user picked in Settings. Null means they never picked one, so
-- the app's default (follow the system) applies. Written by the user under
-- profiles_update_own.
alter table public.profiles
  add column theme text check (theme in ('light', 'dark', 'system'));
