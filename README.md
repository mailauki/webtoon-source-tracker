# Webtoon Source Tracker

Tracks **where** you read each manga and webtoon — the app, the site, or a
physical copy. MyAnimeList already knows *what* you read and how far along you
are; it doesn't know that chapter 42 was on WEBTOON and the rest was on Tapas.

Your account lives in Supabase. MyAnimeList is a **connection** you link to it,
not a login — so you can unlink and relink without losing anything, and account
recovery works normally.

AniList can be connected the same way. MyAnimeList stays the library's source
of truth; AniList is kept in step with it — progress saved in the app is
mirrored there, and **Settings → Sync accounts** reconciles the two lists
(both ways, newest edit wins, or one way). Nothing is ever deleted from
either site.

## Scope

Deliberate boundaries, so a feature that crosses one gets questioned rather
than quietly built:

- **Everything but the front door is behind a login.** The library, entries,
  collections, settings and `/discover` all call `verifySession()`. Only the
  landing page, the auth screens and the legal pages are public. A new page
  belongs in the gated set unless there is a reason it cannot be.
- **No user-to-user interaction.** That is what "no social features" means
  here: no following, sharing, profiles, comments, likes, or public libraries —
  nothing that puts one reader in contact with another, or shows one reader's
  shelf to another. RLS is select-own on `user_entries` and `entry_sources`, so
  that is enforced by the database rather than by which screens exist.
- **`/discover` is the one shared surface, and it is editorial.** Curated
  collections and tags are admin-authored (`owner_id is null`, see
  `supabase/migrations/20260909000000_admins_and_tags.sql`), shown to everyone
  signed in, and writable only by an admin granted out of band via
  `yarn grant:admin`. It is a shelf the maintainer curates *for* readers, not a
  place readers publish to each other.

Shared *catalog* data is not user-to-user contact: `media_titles` is one row
per MAL title readable by any signed-in user, because it describes a comic
rather than a person. The line is whether a row says anything about who reads
what.

## Stack

- Next.js 16 (App Router, Server Components) · React 19 · TypeScript
- Tailwind v4 + shadcn/ui (owned source, restyled)
- Supabase — Postgres, Auth, RLS
- MyAnimeList API v2
- AniList GraphQL API

## Setup

```bash
yarn install
cp .env.example .env.local   # then fill it in
yarn dev
```

`.env.example` documents every variable plus the Supabase dashboard settings a
deploy needs.

To populate a demo account with a sample library (12 titles and their source
assignments), set `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` and run:

```bash
yarn seed:demo           # upsert; safe to re-run
yarn seed:demo --reset   # clear that user's entries first
```

It is scoped to that one user and writes a token-less `mal_connections` row so
`/library` renders the grid rather than the connect CTA. See the header comment
in `scripts/seed-demo.ts` for why that row cannot trigger a destructive sync.

Database migrations live in `supabase/migrations/` and are applied with the
Supabase CLI:

```bash
supabase migration list --linked   # compare local and remote
supabase db push                   # apply pending migrations
```

## Architecture

```
Browser ─▶ proxy.ts            cheap cookie check only (no DB, no network)
             │
             ▼
        app/(app)/*  ─▶ lib/auth/dal.ts    real auth, cached per request
             │
             ├─▶ Supabase (RLS)            library, entries, sources
             └─▶ Server Actions ─┬▶ MalClient     ─▶ api.myanimelist.net
                                 └▶ AniListClient ─▶ graphql.anilist.co
```

**Two-layer auth.** `proxy.ts` only checks whether a session cookie exists, to
avoid flashing a protected page. It proves nothing. Real enforcement is
`verifySession()` in `lib/auth/dal.ts`, called from the authed layout, every
protected page, and **the top of every server action** — actions are
independently reachable HTTP endpoints, so a layout check does not protect them.

### Data model

| Table | Holds |
|---|---|
| `profiles` | one row per auth user |
| `mal_connections` | links an account to a MAL account (`active` / `disconnected` / `needs_reauth`) |
| `private.mal_tokens` | OAuth tokens; unreachable via the Data API |
| `anilist_connections` | links an account to an AniList account, same statuses as MAL |
| `private.anilist_tokens` | AniList access token; same isolation as `mal_tokens` |
| `media_titles` | **shared catalog** — one row per MAL title, owned by nobody |
| `user_entries` | one user's progress against a title |
| `entry_sources` | **where that user reads it** — the product |
| `sources` | global catalog + per-user custom sources under "Other" |

The catalog is deliberately separate from progress: ten users tracking the same
title share one metadata row instead of ten copies. Measured on representative
data, that is ~58% smaller than the denormalised alternative.

## Things that will bite you

Each of these was found the hard way; all are load-bearing.

- **MAL's `expires_in` is the *refresh* window (~28 days), not the access
  token's** — despite the docs saying "one hour". Never compute access-token
  expiry from it. `MalClient` refreshes reactively on 401.
- **MAL rotates the refresh token on every refresh.** Persist both tokens or the
  connection dies silently about a month later.
- **MAL's PKCE is `plain` only** — the code challenge equals the verifier. This
  looks like a bug and is not; "fixing" it to S256 breaks login.
- **`PUT /manga/{id}/my_list_status` is form-encoded**, not JSON.
- **MAL signals over-quota with 403, not 429.** Retrying it makes things worse.
- **`private` schema is unreachable via PostgREST** (406 even with the secret
  key), which is why token access goes through `SECURITY DEFINER` RPCs granted
  only to `service_role`.
- **Next 16 renamed `middleware.ts` to `proxy.ts`.** Most Supabase tutorials
  still put `getUser()` in middleware; this app deliberately does not.
- **`@theme inline` resolves at parse time**, so font families must be literal
  strings — `var(--font-*)` silently resolves to nothing.
- **Sync's removal step is guarded.** Entries missing from MAL are only deleted
  when every page fetched cleanly *and* the result exceeds half the stored
  count. A partial MAL response must never cascade away hand-entered sources.
- **Writes go to MAL first.** The local cache updates only from MAL's echoed
  response, so it can fall behind MAL but never ahead. AniList is mirrored
  *after* both succeed, best-effort — a failed AniList write never fails the
  save; the account sync repairs it.
- **AniList tokens last a year and cannot be refreshed.** Its token response
  includes a `refresh_token`, but AniList does not honour it. On expiry the
  connection goes `needs_reauth` and the user reconnects.
- **AniList scores are written as `scoreRaw` (0–100)**, never `score`, which is
  read in the user's own score format — a 7 sent to a POINT_100 user lands as
  7/100.
- **Titles are matched across the two sites by MAL id** (AniList's `idMal`).
  An AniList title with no MAL counterpart cannot be synced — common for
  Korean webtoons — and is reported as skipped rather than guessed at.
