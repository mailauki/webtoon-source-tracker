# Deferred work

Things consciously left out of v1, with enough context to pick them up cold.
Anchored `TODO(id)` comments in the code point back to these sections.

---

## Auth

### `TODO(apple-login)` — Sign in with Apple

**Where:** `app/actions/auth.ts` (`signInWithProvider`),
`app/actions/identities.ts` (`linkProvider`),
`components/settings/linked-logins.tsx` (`LINKABLE`, `PROVIDER_LABELS`)

Deferred from the original plan for reasons that still hold:

- Requires a **paid Apple Developer account** ($99/yr).
- The client secret is a JWT that **expires every 6 months** and must be
  regenerated from a `.p8` key — a recurring operational chore with a silent
  failure mode. Whoever adds this should also set a calendar reminder; the
  symptom of an expired secret is Apple sign-in breaking with no deploy having
  happened.
- Apple relays a private `@privaterelay.appleid.com` address unless the user
  opts to share theirs, so **same-email auto-linking usually will not fire** —
  Apple tends to create a separate account. Manual linking in settings is the
  path that works, and is already enabled.

Supabase supports Apple natively, so the code change itself is small: add
`"apple"` to the two allowlists and to `LINKABLE`. The work is in the Apple
Developer portal (App ID, Service ID, key, return URL).

### MAL as a login provider — evaluated and **rejected**

Not a TODO. Recorded so it isn't reopened.

- **Third-party auth: impossible.** It needs an OIDC issuer with
  asymmetrically-signed JWTs. All four MAL `.well-known` discovery paths
  return **404**; MAL is not an OIDC provider.
- **Custom OAuth2 provider: technically possible.** Supabase supports non-OIDC
  OAuth2 with manual endpoints, and both blockers have documented escapes —
  `pkce_enabled: false` (MAL supports only `plain`, never S256) and
  `email_optional: true` (MAL returns no email).
- **Rejected anyway**, because it inverts the architecture. As a login provider
  Supabase would hold the MAL token, so write-back would need `provider_token`
  plumbing, and MAL would become a login *identity* rather than a *connection*
  that can be unlinked and relinked without touching the account. The current
  custom flow in `lib/mal/oauth.ts` keeps MAL as what it should be.

Revisit only if MAL ships real OIDC discovery.

---

## Data safety

### `TODO(confirm-destructive)` — no confirmation before deleting a source

**Where:** `components/entry-source-editor.tsx`

Clicking the trash icon deletes immediately, with no undo. The URL, per-source
progress, and notes are hand-entered and **unrecoverable** — the only data in
the app a re-sync cannot rebuild.

`components/ui/alert-dialog.tsx` is already installed but never rendered
anywhere (the only other mention of `AlertDialog` in the tree is the TODO
comment pointing here). This is the natural first use.

### `TODO(soft-delete)` — sync removal is a hard delete

**Where:** `lib/sync/sync-list.ts`

Entries missing from MAL are deleted outright, cascading to `entry_sources`.
A 50%-of-existing-rows guard makes a *truncated* MAL response non-destructive,
but a genuine MAL-side deletion is irreversible here — including source
assignments that MAL never knew about.

An `archived_at` column would make removals recoverable, at the cost of
filtering it out of every library query.

### `TODO(encrypt-tokens)` — MAL tokens stored in plaintext

**Where:** `lib/mal/token-store.ts`, `private.mal_tokens`

A deliberate v1 call, not an oversight. Three independent layers already guard
the table: the `private` schema is not in Exposed Schemas, grants are revoked
from `anon`/`authenticated`, and RLS is on with zero policies. An encryption
key living in the same environment as `SUPABASE_SECRET_KEY` adds little on top.

Worth revisiting via Supabase Vault if this ever stores tokens for people other
than its author.

---

## Features

### Anime support

The schema is ready: `media_titles.media_type` is
`text not null default 'manga' check (media_type in ('manga','anime'))`, and
`unique(media_type, mal_media_id)` already keys on it. **Nothing in the UI or
sync layer touches anime** — `lib/sync/sync-list.ts` fetches only
`/users/@me/mangalist`, and `app/(app)/entry/[id]/page.tsx` hardcodes a
`myanimelist.net/manga/` link.

Adding it means a second sync path (`/users/@me/animelist`, which uses
`num_episodes_watched` rather than `num_chapters_read`), a media-type filter in
the library, and making that outbound link type-aware.

### Recommended titles — an automated "add these" collection

Collections shipped with two shapes (curated and user-owned; see
`supabase/migrations/20260908000000_collections.sql`). A third surface is
obvious from there: a per-user set of titles they don't track yet, generated
rather than chosen.

It fits the schema — items already point at `media_titles` rather than
`user_entries`, so a title nobody tracks is representable. It should **not** be
a `collections` row.

**Why it needs its own table.** `collection_items` is user intent: hand-picked,
and never to be clobbered. A recommendation set is disposable and rebuilt
wholesale, so sharing the table would mean every rebuild has to reason about
which rows the user touched. The write paths differ too — `collection_items`
goes through `private.collection_items_guard()` as the user, while
recommendations are written by a server job with the admin client, so the guard
would need a hole punched in it. And a rec carries columns an item has no
business holding: a score, which library title it was derived from, when it was
generated. `collections_shape_ck` would need a third shape for a row that is
neither curated nor user-owned.

Render it as a collection; store it as its own thing:

```sql
create table public.title_recommendations (
  user_id         uuid   not null references public.profiles (id) on delete cascade,
  title_id        bigint not null references public.media_titles (id) on delete cascade,
  score           real   not null default 0,
  -- The library title this was derived from: drives "because you read X", and
  -- makes a bad recommendation debuggable.
  source_title_id bigint references public.media_titles (id) on delete set null,
  generated_at    timestamptz not null default now(),
  primary key (user_id, title_id)
);

-- Survives rebuilds. The only durable row here; everything above can be
-- truncated and regenerated.
create table public.recommendation_dismissals (
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  title_id   bigint not null references public.media_titles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);
```

Note `on delete cascade` to `media_titles` on both, where the rest of the
schema uses `restrict`: a recommendation is disposable and must never be the
thing blocking catalog cleanup. RLS is select-own on both plus insert/delete-own
on dismissals — no user write policies on `title_recommendations`, the same
shape `mal_connections` uses where the server writes and the user only reads.

**Filter "already in my library" at read time, not at generation time.** A
`not exists` against `user_entries` (and `recommendation_dismissals`) per query
is cheap and always correct. Baking the exclusion into the generated set means a
title sits in the recommendations until the next rebuild after being added.

Two constraints that matter more than the schema:

- **Supply.** Every path into `media_titles` today — `lib/sync/sync-list.ts`
  and `app/actions/add-entry.ts` — runs through some user's MAL account, so the
  catalog is currently a mirror of what users already track and "titles you
  don't have" comes back nearly empty. Generating recommendations means
  upserting catalog rows for titles nobody tracks. That is allowed (the catalog
  is owned by nobody) but it breaks the current invariant that every
  `media_titles` row has at least one `user_entries` row behind it: the catalog
  starts growing on its own, and `on delete restrict` stops implying "nothing
  here is orphaned". Eventually that wants a reaper for rows with no entries, no
  collection items, and no live recommendations.
- **Rate limits.** MAL signals over-quota with 403 and `lib/mal/client.ts`
  deliberately does not retry it, so fanning out a per-library-title fetch on
  page load is not viable. This has to be a batch job, which is the strongest
  argument for persisting a generated set rather than computing on demand.

For candidates, the cheapest real option is MAL's own data: `/manga/{id}`
exposes recommendation and related-title fields that `getManga` does not
currently request (it asks only for `LIST_FIELDS`) — confirm against the API
docs before planning around it. Aggregate across the user's library, weight by
their score and list status, drop anything tracked or dismissed.
`/manga/ranking` is a reasonable cold-start fallback. Collaborative filtering
over `user_entries` is the tempting third option and the wrong one until there
is a real userbase — at one user it returns nothing.

### MAL title search for the admin pickers

`TagTitlePicker` and `CuratedTitlePicker` both call `searchCatalogTitles`,
which searches `media_titles` only. A curated shelf or a tag can only reach
titles somebody has already synced — an admin cannot add a title the catalog
has never seen, even though it exists on MAL and the picker's whole job is
"find a title and attach it."

Fixing this needs two things, not one. First, a MAL search endpoint: MAL's
`/manga?q=` (already wrapped as `searchManga` in `lib/mal/endpoints.ts`, used
today only by the signed-in user's own "add to library" search) would have to
be called from an admin context instead, against some connected account —
the same "any account works, since this endpoint isn't list-scoped" situation
`scripts/backfill-genres.ts` is already in. Second, and the part that doesn't
exist yet: a catalog-insert path that isn't tied to a sync run. Right now the
only code that ever writes a new `media_titles` row is
`lib/sync/sync-list.ts`, as a side effect of pulling someone's list — there is
no standalone "insert this one title MAL told us about" function. The picker
would need one, upserting on `(media_type, mal_media_id)` exactly as sync
does, so that searching and then tagging a title that already existed under
sync's writes still resolves to the same row rather than a duplicate.

Worth doing once the tag/collection vocabulary outgrows whatever a handful of
seeded accounts happen to have read.

### Merging several MAL genres into one tag

`tags.mal_genre_id` is `unique`, so one tag can carry at most one MAL genre id
(see the tags migration). That is fine for MAL genres that map cleanly to one
concept, but MAL splits some concepts across genres an admin would likely want
shown as one tag — "Romance" and "Love Polygon" both read as romance to a
reader browsing `/discover/tag/romance`, but today they can only ever be two
separate tags, two separate pages, and two separate chip sets on the same
title.

The schema has no room to express "these two MAL genres are the same tag"
without changing the uniqueness rule on `mal_genre_id`, and changing that rule
would break the exact guarantee `syncGenres`'s `ignoreDuplicates` upsert
depends on — one genre id resolving to exactly one tag row. A
`tag_mal_genres (tag_id, mal_genre_id)` join table sidesteps that: `tags`
drops the MAL-provenance columns it currently doubles as, `syncGenres` upserts
into the join table instead (still `do nothing` on `mal_genre_id`, still never
touching a tag's editable fields), and `getTagsForTitle` / `getTitlesForTag`
join through it rather than through `tags.mal_genre_id` directly.

Purely additive — nothing above requires removing anything that exists today
— and not yet known to be wanted: no admin has asked for it, and speculative
merging in the other direction (splitting a tag MAL treats as one genre into
two an admin wants distinguished) is a different, harder problem this table
doesn't solve. Build it when a real MAL genre pair turns out to annoy someone
browsing the tag pages, not before.

### Guest demo mode

A signed-out visitor currently sees the landing page and can go no further —
the only way to look at the app is to create an account. For a portfolio link
that is a real drop-off: most visitors want to see the library, not sign up
for one.

A shared demo login is the obvious shortcut and the wrong one. The credentials
would have to be public, so anyone could edit or wipe the demo library, and
every visitor would fight over the same `library_prefs` row — one person's
status filter becomes everyone's. `scripts/seed-demo.ts --reset` makes that
recoverable, not pleasant.

What this should be instead: a **read-only session** at `/demo`, backed by the
seeded account, where reads work and every write is refused.

The enforcement point is the DAL, not the UI. `verifySession()` in
`lib/auth/dal.ts` is called at the top of every server action precisely because
actions are independently reachable HTTP endpoints — so the guard belongs
there, as something like `requireWritableSession()` that the demo session
fails. Hiding the buttons is presentation; it is not the check. Every action in
`app/actions/` would need to move to the stricter call, and the natural test is
that hitting one directly as the demo user is rejected.

Open questions worth settling before building it:

- **How the session is issued.** A Supabase anonymous sign-in whose rows are
  read from the demo user is one option; a signed cookie carrying no Supabase
  identity at all, with reads served server-side, is simpler and cannot write
  by construction.
- **Whether the library is per-visitor or shared.** Shared is far less work and
  is fine as long as nothing can be written. Per-visitor means cloning ~12
  entries plus their sources on arrival, and reaping them later.
- **What write attempts do.** Silently refusing is confusing; the honest
  version is a toast — "Sign up to save changes" — that doubles as the
  conversion prompt, which is the whole point of the demo.

Worth doing when the live link starts getting traffic from people who are not
already signed in. Until then the seeded account plus the screenshots in
`docs/screenshots/` cover the same ground for a portfolio reader.

### Offline support / service worker

`app/manifest.ts` makes the app installable, which per Next's PWA guide needs
only a manifest and HTTPS. There is **no service worker**, so the installed app
still requires the network.

Deliberate: a cache layer is the easiest way to serve users stale JS after a
deploy. Add one only alongside a real versioning strategy.

### Web push notifications

Would need VAPID keys, a subscriptions table, server actions, and permission
UI. No obvious trigger in this app justifies it yet — nothing here happens
without the user initiating it.

---

## Operational

- **Vercel env vars are not in version control.** `MAL_REDIRECT_URI` was once
  set to an empty string in production, which passes Vercel's UI but makes
  `requireEnv()` throw at runtime (`!value` catches `""`). If `/mal/connect`
  starts 500ing after a deploy with no code change, check this first.
- **Supabase Site URL matters more than it looks.** It is the fallback for
  every OAuth error redirect and email link. Pointing it at a
  deployment-protected preview domain silently breaks OAuth in ways that look
  like app bugs — sessions appear to vanish mid-flow, because cookies are
  scoped per exact host.
- **`.env.local` is rewritten by `vercel link` and `vercel env pull`.** Both
  overwrite local-only values. `NEXT_PUBLIC_SITE_URL` and `MAL_REDIRECT_URI`
  must point at `http://localhost:3000` locally and are worth re-checking after
  running either command.
- **Variables marked `--sensitive` pull as an empty string, not an error.**
  This is the same silent-empty failure as the `MAL_REDIRECT_URI` note above,
  but caused by Vercel rather than by hand: the CLI cannot decrypt a sensitive
  variable, so `vercel env pull` writes `KEY=` and every guard that tests
  `!value` fires. It cost a full debugging session — the symptom was
  `SUPABASE_SECRET_KEY is not set` immediately after a successful pull.
  `SUPABASE_SECRET_KEY` now also exists as a *non-sensitive* Development
  variable so local pulls carry the real value; Production keeps the sensitive
  one. If a key ever reads as unset right after pulling, check for an empty
  value before assuming the variable is missing.

---

## Testing

### `TODO(e2e-smoke)` — a browser smoke test for the library

**Where:** would live in `tests/e2e/`, run by Playwright.

The Vitest suite covers filter logic, component state, and a static guard
against function props crossing the server/client boundary. What it cannot
cover is a real RSC render: RTL mounts every component as a client component,
so serialization errors only surface in a browser against a running server.

Three bugs shipped that only a real render would have caught — a render prop
passed into a Client Component, filter state reverting when its transition
settled, and an effect whose inline-closure dependency looped until React
threw "Maximum update depth exceeded". The static guard in
`tests/rsc-boundary.test.ts` now catches the first shape, but not every
variant of it.

The third is covered by `tests/mal-search.test.tsx`, which renders the panel
under RTL and asserts the success effect fires exactly once. That works
because the bug was purely client-side — no session needed. It is worth
noting as the cheaper pattern: a render loop, a stale closure, or an effect
that re-fires does not need a browser to catch, only an actual render.

Deferred because it needs an authenticated session. The intended setup:

- `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` in `.env.local` (gitignored),
  pointing at a dedicated account, never a real one — the test writes to
  `library_prefs` and would clobber a real user's saved filters.
- Playwright signs in once and reuses the storage state.
- The one test worth having: pick a status filter, reload, assert it holds.
  That single path exercises the whole feature — the write, the read, the
  RSC boundary, and the hydration.

Worth adding when the app has a second stateful surface to cover, or the
first time a bug reaches production that the unit suite could not see.
