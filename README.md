# Webtoon Source Tracker

Tracks **where** you read each manga and webtoon — the app, the site, or a
physical copy. MyAnimeList already knows *what* you read and how far along you
are; it doesn't know that chapter 42 was on WEBTOON and the rest was on Tapas.

Your account lives in Supabase. MyAnimeList is a **connection** you link to it,
not a login — so you can unlink and relink without losing anything, and account
recovery works normally.

## Stack

- Next.js 16 (App Router, Server Components) · React 19 · TypeScript
- Tailwind v4 + shadcn/ui (owned source, restyled)
- Supabase — Postgres, Auth, RLS
- MyAnimeList API v2

## Setup

```bash
yarn install
cp .env.example .env.local   # then fill it in
yarn dev
```

`.env.example` documents every variable plus the Supabase dashboard settings a
deploy needs.

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
             └─▶ Server Actions ─▶ MalClient ─▶ api.myanimelist.net
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
  response, so it can fall behind MAL but never ahead.
