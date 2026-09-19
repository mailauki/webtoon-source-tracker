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

### `TODO(remove-entry)` — nothing can be taken off the shelf

**Where:** `components/entry-card-menu.tsx` (`useEntryCardActions`),
`lib/mal/endpoints.ts` (beside `updateListStatus`), `app/entry/[id]/page.tsx`

Titles only ever arrive. `addEntry` puts one on the list, `syncMalList` brings
the rest in, and nothing anywhere says "I'm done with this, take it off." The
only way a row leaves `user_entries` today is the sync noticing MAL no longer
has it — which means opening MyAnimeList in another tab to do the actual
removal, then waiting for a sync to notice.

- **The endpoint exists and the client already speaks it.**
  `DELETE /manga/{manga_id}/my_list_status`, and `RequestOptions` in
  `lib/mal/client.ts` already lists `"DELETE"` as a method, so this is a
  `deleteListStatus` next to `updateListStatus` in `lib/mal/endpoints.ts` and
  nothing below it has to change.
- **404 is a success here.** The documented response is 200 on removal and 404
  when the title was not on the list — confirm against the API docs, but plan
  for it: a double click, or a title already removed from another device, must
  not surface as a failed removal when the user's intent has been satisfied.
- **MAL first, as always.** Same non-negotiable ordering `updateProgress` and
  `addEntry` both document. A local-only delete is silently undone by the next
  sync, which re-adds the row from MAL's copy.
- **The local delete cascades to `entry_sources`** — the URLs, per-source
  progress and notes that no re-sync can rebuild. Two existing notes bear
  directly on this. `TODO(confirm-destructive)` wants the installed-but-never
  rendered `AlertDialog`, and this is a better first use than the source
  delete: the blast radius is a whole title. `TODO(soft-delete)` wants an
  `archived_at` column, and a *user-initiated* removal is the stronger argument
  for one, because here the user can be deliberately wrong.
- **Two removals, and they must not sit next to each other unmarked.**
  "Remove from my library" deletes the row. "Dropped" is a `list_status` the
  progress editor already offers (`STATUSES` in `components/progress-editor.tsx`)
  and keeps everything. They read almost identically as menu items and differ
  by an irreversible cascade, so the destructive one needs to look destructive
  wherever the two end up together.

The card context menu is where the other per-title actions live, and the entry
page needs it too — that is where someone lands once they have decided.

### `TODO(bulk-edit)` — multi-select on the shelf

**Where:** `components/library-grid.tsx` (selection belongs beside the
filters), `components/entry-card.tsx`, `app/actions/progress.ts`

Every action in the app is per title. Marking a finished series read, filing
ten titles into a collection, attaching the same source to a batch that all
came from one site — each is the same click repeated, and the shelf already
knows how to show exactly the set someone wants to act on, because the chips
just narrowed it to them.

- **The closest existing surface is not actually a multi-select.**
  `components/collections/add-titles-dialog.tsx` looks like one — a filterable
  list of library rows with a per-row state — but each row is its own form that
  commits on click, and its `added` Set records what has already been written
  rather than what is chosen. Worth reading for the list and the browser-side
  filtering; it has no selection model to lift.
- **It is a mode, not a checkbox.** A card's own click is already a link to its
  entry page and its ⋯ button already opens `EntryCardSheet` (right-click opens
  the same actions as a context menu on a desktop). All of that has to be
  suppressed while selecting, or the first tap does two things. The state goes
  in `<LibraryFilters>`, which already owns the rows and already spans the
  header and the grid.
- **The write side is the actual work.** MAL has no bulk endpoint, so N titles
  is N sequential `PUT /manga/{id}/my_list_status` calls, and `lib/mal/client.ts`
  deliberately does not retry a 403 over-quota. That makes a bulk action a
  partial-failure problem rather than a loop: it needs per-title results, copy
  that can say "7 of 10 applied", and it must leave the local cache untouched
  for the three that failed — the invariant `updateProgress` spells out.
- **One action taking many ids, not many actions.** Next dispatches Server
  Actions sequentially per client, so firing N from the browser queues them
  anyway and gives up any chance of reporting progress while they run.
- **Worth doing, in order:** status change, add to collection, quick-add a
  source. Bulk *removal* multiplies exactly the unrecoverable cascade
  `TODO(remove-entry)` is careful about, so it should come last if at all, and
  not before `TODO(soft-delete)` makes it undoable.

### `TODO(authors)` — "more from this author"

**Where:** `lib/mal/endpoints.ts` (`LIST_FIELDS`), `lib/mal/types.ts`
(`malMangaNodeSchema`), `app/entry/[id]/page.tsx`

The entry page shows a title's kind, status, score and chapter count, and never
says who made it. The obvious next question — what else has this author
written — has nowhere to be asked.

- **The data is neither fetched nor stored.** `LIST_FIELDS` asks for `genres`
  and `nsfw` but not `authors`, so it never reaches `media_titles`. Requesting
  `authors{first_name,last_name}` returns entries shaped
  `{ node: { id, first_name, last_name }, role }`, where `role` separates Story
  from Art — confirm the shape against the API docs before building on it. The
  field rides the pages the sync already fetches, so asking for it costs no
  extra requests.
- **Store it like genres, but not *in* genres.** `tags` + `title_tags` are the
  right shape — a shared catalog-level annotation, with a provenance rule
  (`mal_genre_id`, insert-only from sync) that lets a local rename survive
  every later sync. An author is not a tag, though: `tags.kind` is
  `check (kind in ('genre','trope','theme','format'))` and `mal_genre_id` is a
  genre id, so reusing the table means widening a check constraint and adding a
  second nullable provenance column for a different MAL id namespace
  (`people`). An `authors` + `title_authors` pair modelled on those two keeps
  both tables honest. `role` is a property of the link, not of the author.
- **Supply is the real constraint, and it is the same one the recommendations
  note describes.** `media_titles` only holds titles somebody tracks, so "more
  from this author" over the local catalog returns the two you already have and
  implies the author wrote nothing else. MAL's v2 API has no author search —
  `/manga?q=` matches title text only — so there is no cheap way to fill that
  in on demand.

  Two honest shapes, and the difference is worth deciding before any schema
  work: show only what is local and *say so* ("Also in your library"), or make
  the author's name a link to `myanimelist.net/people/{id}` and do not pretend
  to a shelf at all. The second is a line of JSX once the id is stored, and it
  never lies. The first is a real section, and it needs the catalog to grow
  past what users happen to track first.

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

### Latest available chapter, from the source itself

`chapterTotal()` (`lib/data/chapter-totals.ts`) reads MAL's `num_chapters`,
which is 0 or null for most ongoing webtoons. That is exactly where the
"own all" shortcut goes missing and the form falls back to "MyAnimeList has no
chapter count for this title yet" — so a count from the source a title is
actually read on would fill the one hole the feature has.

`entry_sources.url` is a series URL the user already pasted, so for some
sources the count is reachable without asking for anything new.

**Only where a machine interface is published.** Two of the catalog's sources
have one:

- **MangaDex** — a documented public API, no auth:
  `GET https://api.mangadex.org/manga/{id}/aggregate?translatedLanguage[]=en`
  returns the chapter list. The id is in the pasted URL
  (`mangadex.org/title/{id}/…`).
- **WEBTOON** — per-series RSS at
  `/{lang}/{genre}/{series}/rss?title_no={id}`. The `title_no` is already a
  query parameter on the URL people paste, so the feed URL is derivable from
  what is stored.

Everything else in the catalog (Tapas, Lezhin, Manta, Kakao Page, Tappytoon,
VIZ, K MANGA, INKR, MANGA Plus) is a paywalled catalog behind a JS-rendered
SPA, frequently Cloudflare, sometimes a login. Reading those means a headless
browser or reverse-engineered internal endpoints, a per-site adapter that
breaks on every redesign, and terms that generally prohibit automated access —
a real exposure for a deployed app, not a hypothetical. Custom "Other" sources
are arbitrary URLs and cannot have an adapter at all. **Those stay unsupported
on purpose**, and the absence of a count for them is not a bug to fix.

Shape, when it gets built:

- A registry keyed by source slug, `adapters[slug]?.latestChapter(url)`,
  returning `{ latest, at } | null`. Every unknown source returns null and the
  UI simply does not offer the hint — the same way it behaves today when MAL
  has no count, so nothing new has to be designed for the empty case.
- Server-side. CORS rules out the browser, and the fetch must not sit in the
  request path.
- Cached per *series*, not per user and not per page load: one fetch serves
  everyone tracking that title. A `source_chapter_counts (source_id, series_key,
  latest, fetched_at)` table, filled by a cron rather than on read. Vercel's
  serverless IPs get rate-limited quickly otherwise.
- Feeding `chapterTotal()` as a fallback when MAL has none, so the "own all"
  button and the union summary keep working unchanged — this adds a source of
  truth, not a second code path.

Note the cache is shared catalog data (like `media_titles`), not user data: it
records what a public feed says about a series, never anything about who reads
it. That keeps it on the right side of the scope in the README — nothing here
exposes one user's library to another.

### Owned chapters across titles, in SQL

`entry_sources.chapters_owned` is an `int4multirange`, so a gap is expressible
and the per-source sets union correctly — owning 1–40 on two sources is 40
chapters, not 80. The union runs in the browser (`unionRanges` in
`lib/data/chapter-ranges.ts`) because the entry page already has every source's
ranges in the rows it fetched, so asking Postgres for what is already on the
client would be a round-trip for nothing.

That stops working the moment a question spans titles: "how many chapters do I
own across my whole library", or "which titles have gaps". Those want
`range_agg` server-side rather than every title's ranges shipped to the browser
to be added up there. The column is already the right type for it — the work is
a view or an RPC plus somewhere to show the answer, not a schema change.

Not yet known to be wanted: no screen asks a cross-title question about
ownership today, and the library toggle only needs the `is_owned` boolean,
which `isOwned` in `lib/data/pick-random.ts` reads without touching the ranges
at all.

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

### `TODO(deep-links)` — the blank sheet before an external link opens its app

**Where:** `components/entry-card.tsx` and `components/entry-row.tsx` (the read
link), `app/manifest.ts` (`display`), `lib/data/canonical-url.ts`

Tapping a read link from the installed app on iOS sometimes shows an empty
in-app browser sheet — white body, empty URL bar — for a beat before the native
app takes over. Reported against WEBTOON and Manta; **not** against Tapas.

**The mechanism.** `display: "standalone"` means iOS hands every external link
to the system in-app browser rather than to Safari. That sheet is presented
*before* iOS evaluates whether the URL is a universal link some installed app
claims. When one does, the load is cancelled mid-flight and the app is brought
forward — leaving the sheet blank for however long the handoff takes. No web
API can suppress, detect, or close it: the sheet belongs to the OS, and the
page is cross-origin so `window.close()` is not available either.

**What shipped, and what it did not fix.** `canonicalUrl` removes the redirect
hops that widen that window — `http://` upgrading to https, a bare or `m.` host
redirecting to the canonical one, a share sheet's `utm_` tail — on the theory
that universal links are matched against the URL actually requested, not
against wherever a 301 lands.

**That theory has now been measured, and it does not explain the symptom.**
`planRewrites` over all 81 stored links returns **zero rewrites** — every one
was already canonical before any of this shipped. The hosts:

```
 40  www.webtoons.com      canonical
 30  tapas.io              canonical
  4  mangaplus.shueisha.co.jp
  3  only.tappytoon.com    shortlink
  3  link.manta.net        shortlink
  1  www.tappytoon.com
```

Read that against the report — WEBTOON and Manta blank, Tapas does not:

- **WEBTOON is the case that settles it.** Forty links, already canonical, no
  redirect to remove, and it blanks anyway. Whatever causes the flash there is
  not a redirect hop, so no amount of URL cleanup will touch it.
- **Tapas is canonical too, and does not blank** — so the difference between
  the two is not in the stored URL at all. The remaining explanation is the
  device: which of these apps is installed, and therefore which links iOS
  actually hands off. Under that reading the blank sheet *is* the universal
  link working.
- **Manta is the one place a hop is real.** All three are `link.manta.net`
  shortlinks, which must redirect before anything can claim them. Still
  unquantified: the sandbox this was measured from cannot reach those hosts
  (the proxy 403s `link.manta.net`, `only.tappytoon.com`, `webtoons.com` and
  `tapas.io` alike), so the chain length is unknown. Three rows — repasting the
  canonical series URLs by hand settles it faster than any code would.

So `canonicalUrl` keeps new links clean, which is worth having and costs
nothing, but it was never the fix for this. **The open question is the device,
not the data**: which of WEBTOON, Manta and Tapas are installed.

**If it is the handoff**, the only thing that skips the web view is a custom
scheme (`webtoon://`, `tapas://`) opened directly. Costs, all real:

- A nullable `app_scheme` on `sources`, plus a per-source template for turning
  a stored series URL into a scheme URL — the id is in the URL for WEBTOON
  (`title_no`) and MangaDex, and is not reliably extractable for the rest.
- **Silent failure when the app is not installed.** Navigating to an unhandled
  scheme does nothing visible, so it needs a fallback timer to the https URL,
  which is a race with no reliable "did it work" signal.
- iOS shows an "Open in …?" confirmation, so the tap costs a second tap.

That is a worse interaction than a brief flash for everyone who has the app,
and strictly worse for everyone who does not. **Probably not worth building** —
but it is the honest answer to "remove the blank frame entirely", and it should
be written down as evaluated rather than rediscovered.

`display: "browser"` in the manifest is the other lever: links open a real
Safari tab and the handoff is the ordinary one. It fixes the symptom by giving
up the standalone window, which is not a trade worth making for a flash.

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
