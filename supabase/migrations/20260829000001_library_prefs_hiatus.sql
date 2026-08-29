-- Sticky "hide hiatus" toggle
--
-- Sits alongside status/source/sort in library_prefs, and is remembered the
-- same way: hiding paused titles is a standing view of the shelf, not a one-off
-- gesture, so it should survive leaving the page.
--
-- Boolean rather than the text-with-'all'-sentinel convention the filter
-- columns use. Those need three states because "show everything" has to stay
-- distinct from "never chose"; this one does not — the toggle is off unless the
-- user turns it on, and a null reads as off. Defaulting to false is also what
-- keeps this release from silently emptying rows off anyone's shelf.

alter table public.library_prefs
  add column hide_hiatus boolean not null default false;

comment on column public.library_prefs.hide_hiatus is
  'When true, the library grid hides entries whose every source is on hiatus.';
