-- Sticky "owned only" toggle
--
-- Stored beside hide_hiatus, and remembered the same way: "show me only what
-- I have paid for" is a standing view of the shelf, not a one-off gesture.
--
-- Positive where hide_hiatus is negative, which is deliberate rather than an
-- inconsistency. The interesting question about a paused title is "get it out
-- of my way", so that toggle subtracts; the interesting question about an
-- owned one is "show me the ones I bought", so this one selects. Naming it
-- `hide_unowned` would store the same bit under a name that describes the
-- side effect instead of the intent, and would read backwards next to the
-- button that says "Owned only".
--
-- Boolean, not the text-with-'all'-sentinel the status and source columns use:
-- like hide_hiatus it has no third state to preserve — off unless the user
-- turns it on, and a null reads as off. Defaulting to false is also what stops
-- this release from emptying every shelf that has nothing marked owned yet.

alter table public.library_prefs
  add column owned_only boolean not null default false;

comment on column public.library_prefs.owned_only is
  'When true, the library grid shows only entries the user owns at one or more of their sources.';
