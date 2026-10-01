-- Two more library filters, set from the iOS app's filter sheet:
--
--   official   'official' or 'unofficial': titles with at least one source of
--              that kind. Null, 'all' or anything else shows both, like the
--              other chip-style filters.
--   hide_paid  hides titles that are paid at every source they're read on;
--              one free source keeps a title showing, as one still-updating
--              source keeps it out of "hide hiatus".
alter table public.library_prefs
  add column official text,
  add column hide_paid boolean not null default false;
