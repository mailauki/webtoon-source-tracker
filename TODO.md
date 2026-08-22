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
