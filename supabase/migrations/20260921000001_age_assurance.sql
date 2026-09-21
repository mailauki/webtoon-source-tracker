-- Age confirmation, and where it came from.
--
-- Pairs with library_prefs.hide_nsfw (previous migration). That column is a
-- preference — "I would rather not see these" — and a preference is not an
-- age check: on its own it lets anyone opt into adult titles by pressing a
-- switch. These columns are the other half, and lib/auth/dal.ts's
-- hidesMatureTitles() is where the two meet.
--
-- A RANGE, not a date of birth. Three reasons, in order of weight:
--
--   1. A bracket is all any surface here asks. Nothing in this app needs to
--      know somebody's birthday, and storing one would be collecting personal
--      data to answer a question it does not answer any better.
--   2. It is the shape the platform APIs hand out. Apple's Declared Age Range
--      and Google Play's age signals both return a bracket derived from the
--      store account, never a date — so a column shaped like a date would have
--      to throw away most of what a platform signal says in order to store it.
--   3. A bracket degrades honestly. "16 to 17" stops being true on a birthday
--      nobody told us about, and a range says that plainly where a computed
--      age from a stale date of birth would not.

alter table public.profiles
  add column age_range text
    check (age_range in ('under_13', '13_to_15', '16_to_17', '18_or_over')),

  -- How the range above was established. Today only 'self_declared' is ever
  -- written, and it is written by app/actions/age.ts.
  --
  -- The two platform values are here now, unused, because they are the reason
  -- this column exists at all: without them the method is a constant and the
  -- column is dead weight. They are NOT reachable from this codebase — both
  -- are native SDKs that read the signed-in store account (Apple's from iOS,
  -- Google's from Play services), and a browser has no access to either. They
  -- become writable the day this app has a native target, and the seam they
  -- land on is `rangeFromBounds` in lib/data/age.ts, which turns the numeric
  -- bounds both APIs return into one of the brackets above.
  --
  -- When that day comes: a platform value must NOT be writable by the client.
  -- profiles_update_own lets a user write their own row, so anything claiming
  -- to be a verified signal has to be written by a trusted path that checked
  -- the attestation first — the service role, or an edge function. The server
  -- action's schema only accepts 'self_declared' precisely so the client
  -- cannot dress a self-declaration up as a verified one.
  add column age_assurance_method text
    check (age_assurance_method in (
      'self_declared',
      'apple_declared_age_range',
      'google_play_age_signals'
    )),

  -- When it was established. A platform signal can go stale (the account's
  -- declared age changes, or the user switches accounts), so the timestamp is
  -- what a future re-confirmation prompt would be driven from.
  add column age_assured_at timestamptz,

  -- All three or none. A range with no method would be a claim with no
  -- provenance, and provenance is the entire point of the middle column.
  add constraint profiles_age_assured_together check (
    (age_range is null) = (age_assurance_method is null)
    and (age_range is null) = (age_assured_at is null)
  );

comment on column public.profiles.age_range is
  'The user''s declared age bracket: under_13, 13_to_15, 16_to_17, 18_or_over, or null when never confirmed.';

comment on column public.profiles.age_assurance_method is
  'How age_range was established. Only ''self_declared'' is written by this app; the platform values require a native target and a trusted write path.';

comment on column public.profiles.age_assured_at is
  'When age_range was last established.';
