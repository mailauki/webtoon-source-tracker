# Admin-managed curated collections and tags

**Date:** 2026-09-08
**Status:** Approved, ready for planning

## Problem

Curated collections on `/discover` are content with no editor. They exist only
as literals in `scripts/seed-collections.ts`, applied with the service role,
because RLS gives them no other writer: the insert policy requires
`owner_id = (select auth.uid())` and `null` never equals a uuid. Adding a shelf
means editing TypeScript and running a script.

Separately, there is no way to group titles by trope or genre. `media_titles`
stores no tag data, and `LIST_FIELDS` in `lib/mal/endpoints.ts` never requests
MAL's `genres` field, so the sync discards it.

Those are two different gaps. MAL knows the *genres* — Romance, Fantasy,
Action — and will hand them over for free; not importing them means hand-typing
data that already exists. MAL does not know the groupings readers actually
browse manhwa by: "Enemies to Lovers" is a trope, and so are regression,
villainess, and system. Those are editorial no matter where they come from.

So tags have two origins, and the design has to hold both without one
overwriting the other.

## Goals

- One named admin (initially the project owner) can create, edit, retire, and
  populate curated collections through the app rather than through a script.
- Titles can carry tags — genres, tropes, themes, formats — visible to every
  reader. Genres are imported from MAL; tropes and anything else are created by
  the admin.
- An imported tag is an ordinary editable row once it exists. MAL can create a
  tag; it can never overwrite one.
- Readers can browse a tag.
- Admin capability is enforced by the database, not only by application code.

## Non-goals

- **Community tagging.** Users tagging titles publicly needs moderation, a
  report path, and rate limiting — the same reasons the collections migration
  deliberately omitted sharing.
- **Private user tags.** Deferred, but the schema below leaves room so it is a
  policy change rather than a table rewrite.
- **Adding titles to the catalog.** The pickers search `media_titles` only.
  Building a shelf around a title nobody tracks needs a MAL search endpoint and
  a catalog-insert path that today only sync owns. Recorded in `TODO.md`.
- **Admin power over users' private collections.** Every admin policy below is
  scoped `owner_id is null`. Admin means editorial, not omniscient.
- **Merging several MAL genres into one tag.** `tags.mal_genre_id` is unique,
  so one tag carries at most one MAL genre. Wanting "Romance" and "Love
  Polygon" to collapse into one tag needs a `tag_mal_genres (tag_id,
  mal_genre_id)` table — additive later, and not yet known to be wanted.
- **Drag-and-drop reordering.** Up/down buttons; a twelve-item shelf does not
  justify a drag library.

## Design

### 1. The admin gate

```sql
create table public.admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       text not null default 'admin' check (role in ('admin', 'editor')),
  granted_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy admins_select_self on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));
```

**There is no insert, update, or delete policy, and that is the mechanism.**
RLS denies by default, so no request carrying a user's JWT can grant admin —
not a forged one, not a bug in a route handler. Rows are written by the service
role only, through `yarn grant:admin <email>`. This is the same reasoning that
makes curated collections unwritable today: safety from the absence of a
permitting policy, not from a check someone has to remember to write.

`role` is on this table rather than on `profiles` so there is exactly one door.
Two independent grants (an `admins` row *or* a `profiles.role` column) would
mean two places to audit and a revocation that is easy to half-finish. The
column exists so `editor` can be distinguished from `admin` later without a
new table; today every row is `admin` and nothing reads the column.

```sql
create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where user_id = (select auth.uid())
  );
$$;
```

`security definer` so policies do not require callers to hold `select` on
other rows of `admins`. `stable` so the planner evaluates it once per statement
rather than per row. `private` so PostgREST cannot route to it.

App side, `lib/auth/dal.ts` gains:

- `isAdmin(): Promise<boolean>` — cached, does not redirect.
- `verifyAdmin(): Promise<{ userId: string }>` — calls `verifySession()` first,
  then `notFound()` if not an admin.

`verifyAdmin()` at the top of every admin server action is defence in depth
that produces a clean error. RLS is what actually stops a forged request.

### 2. Tags

```sql
create table public.tags (
  id           bigint generated always as identity primary key,
  slug         text not null unique,
  name         text not null,
  description  text,
  kind         text not null default 'trope'
                 check (kind in ('genre', 'trope', 'theme', 'format')),
  -- Provenance, not a sync target. Records which MAL genre first caused this
  -- row to exist. Null for tags invented here ("Enemies to Lovers"). Nothing
  -- ever writes back through it: see "MAL seeds, the database owns" below.
  mal_genre_id bigint unique,
  sort_order   int not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.title_tags (
  id         bigint generated always as identity primary key,
  title_id   bigint not null references public.media_titles (id) on delete cascade,
  tag_id     bigint not null references public.tags (id) on delete cascade,
  owner_id   uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint title_tags_uniq unique (title_id, tag_id, owner_id)
);
```

Tags are a table, not free text on the join row. Strings become "Enemies to
Lovers", "enemies to lovers", and "Enemies-to-Lovers" within a month, and
renaming one means rewriting every row. A table makes rename a one-row update
and gives each tag a slug, a description, and a page.

`kind` lets "Romance" (a genre) and "Enemies to Lovers" (a trope) coexist
honestly in one table and be grouped separately in the UI without a second one.

`title_id` cascades on delete, unlike `collection_items.title_id`, which
restricts. The asymmetry is deliberate: a tag is an annotation, and losing an
annotation when its subject disappears is correct. A collection item is
content somebody assembled, so it blocks the delete instead.

`owner_id` is nullable and always null for now. It is in the unique constraint
because Postgres treats NULLs as distinct, which means the constraint already
permits one curated row plus one private row per user per title — the deferred
private-tags feature needs a policy and a UI, not a migration of this table.

#### MAL seeds, the database owns

`LIST_FIELDS` in `lib/mal/endpoints.ts` gains `genres`, and
`malMangaNodeSchema` gains an optional `genres: { id, name }[]` — optional
because MAL omits fields unpredictably, as the comment atop `lib/mal/types.ts`
warns. `syncList` then writes genre tags alongside its `media_titles` upsert.

The rule that makes this safe to combine with an editable table is one SQL
clause:

```sql
insert into public.tags (mal_genre_id, slug, name, kind)
values (...)
on conflict (mal_genre_id) do nothing;
```

`do nothing`, never `do update`. MAL can bring a tag into existence; it can
never modify one that already exists. Renaming MAL's "Girls Love" to something
better is an ordinary update that sticks forever, because no later sync will
write over it. This is why there is no `display_name` shadow column and no
read-only class of tag: the conflict those would resolve cannot occur.

`title_tags` rows are still attached on every sync, so a title newly given a
genre by MAL picks it up. Only the tag *entity* is frozen after creation.

Imported tags land as `kind = 'genre'`; tags created in the admin UI default to
`'trope'`.

Two consequences follow, and both are intended:

- **Deleting a MAL-linked tag re-creates it on the next sync**, because
  `do nothing` finds no row and inserts one. `is_active = false` is the real
  "stop showing this", so the admin UI offers retire as the primary action for
  MAL-linked tags. Delete means "forget it, and re-import if MAL mentions it
  again".
- **Sync runs as the service role**, which bypasses RLS, so importing needs no
  admin and no policy of its own.

#### Backfill

Adding `genres` to `LIST_FIELDS` only tags a title the next time some user who
has it syncs. Existing catalog rows stay untagged until then.
`yarn backfill:genres` walks `media_titles`, fetches each via `getManga()`, and
writes the tags. It needs a MAL token, so it runs against one connected
account, and it is a one-off rather than a scheduled job.

#### RLS

Any authenticated user selects (active rows filtered by the data layer, as with
`collections.is_active`); insert, update and delete require
`private.is_admin()`.

### 3. Admin writes on curated collections

Existing user policies are **not modified**. Postgres ORs permissive policies
together, so admin capability is added as parallel policies:

```sql
create policy collections_insert_curated on public.collections
  for insert to authenticated
  with check (owner_id is null and private.is_admin());
```

and likewise for update and delete, on both `collections` and
`collection_items`. Every one carries `owner_id is null`: admins gain power
over curated rows only, never over a user's private collection.

`private.collection_items_guard()` needs no change. It derives `owner_id` from
the parent collection, so an admin inserting into a curated collection gets a
null `owner_id` written for them, which is exactly what the new policy checks.

### 4. Surfaces

`/discover` is **not modified**. Admin editing lives at `/admin`, so the reader
path carries no conditional admin branches and no `isAdmin()` call.

| Route | Purpose |
|---|---|
| `app/admin/layout.tsx` | `verifyAdmin()` once; admin nav |
| `app/admin/page.tsx` | Index: counts and links |
| `app/admin/collections/page.tsx` | All curated collections, retired included |
| `app/admin/collections/[id]/page.tsx` | Items: add, remove, reorder |
| `app/admin/tags/page.tsx` | Create, edit, retire tags |
| `app/admin/tags/[id]/page.tsx` | Titles carrying one tag |
| `app/discover/tag/[slug]/page.tsx` | Reader-facing browse by tag |

Non-admins reaching `/admin` get `notFound()`, not a redirect — a 404 does not
confirm the route exists.

The collections index deliberately does not filter `is_active`, unlike
`getCuratedShelves()`. Retiring a shelf must not hide it from the person who
retired it.

The one admin affordance outside `/admin` is a tag editor on `/entry/[id]`,
gated on `isAdmin()` at that page only — tagging wants to be reachable from
where you are already looking at a title.

`proxy.ts` gains `/admin` in `PROTECTED_PREFIXES`. That is the optimistic
cookie check only; the layout's `verifyAdmin()` is the gate.

### 5. Modules

- `lib/data/tag-items.ts` — pure, client-importable shaping and types. Exists
  for the same reason `lib/data/collection-items.ts` does: client components
  import these types, and Vitest follows type imports at runtime, so a
  `server-only` module would break the component tests.
- `lib/data/tags.ts` — `server-only` reads.
- `lib/data/admin.ts` — `server-only` reads for the admin surfaces
  (unfiltered collection lists, tag usage counts).
- `app/actions/admin-collections.ts`, `app/actions/tags.ts` — server actions,
  each opening with `verifyAdmin()`, returning the established
  `{ error?, message? } | null` state shape.
- `scripts/grant-admin.ts` + `yarn grant:admin` — service-role bootstrap.
- `scripts/backfill-genres.ts` + `yarn backfill:genres` — one-off import for
  catalog rows that predate the sync change.

Modified:

- `lib/mal/endpoints.ts` — `genres` added to `LIST_FIELDS`.
- `lib/mal/types.ts` — optional `genres` on `malMangaNodeSchema`.
- `lib/sync/sync-list.ts` — genre tags and `title_tags` written alongside the
  existing `media_titles` upsert, with `on conflict (mal_genre_id) do nothing`.
- `proxy.ts` — `/admin` added to `PROTECTED_PREFIXES`.

## Testing

- **Vitest, pure logic:** tag shaping in `lib/data/tag-items.ts`, slug
  generation, ordering.
- **Vitest, sync:** a MAL node carrying `genres` produces the expected tag and
  `title_tags` rows; a node with `genres` absent syncs unchanged (MAL omits
  fields, and a missing genre list must not fail a sync); a second run over a
  tag whose name was edited locally leaves that name intact — the `do nothing`
  contract, pinned by a test rather than trusted.
- **Vitest, components:** admin forms and pickers with `@/app/actions/*`
  mocked via `vi.hoisted`/`vi.mock`, following the convention already in
  `entry-card-menu.test.tsx`.
- **RLS against real Postgres**, the way the collections migration was
  verified — all ten-plus migrations applied, exercised as three roles
  (non-admin, admin, service):
  - `is_admin()` is false for a user with no `admins` row.
  - A non-admin insert/update/delete on a curated collection is refused.
  - An admin insert into a curated collection succeeds and lands with a null
    `owner_id`.
  - An admin write to another user's private collection is refused.
  - A non-admin write to `tags` or `title_tags` is refused.
  - No user can insert themselves into `admins`.
  - Deleting a profile cascades its `admins` row without touching curated data.

## Consequences

- The catalog-only picker means a curated shelf can only hold titles somebody
  already syncs. On a fresh database that is whatever `yarn seed:demo` wrote.
- `scripts/seed-collections.ts` stays. It is still the fastest way to
  reconstruct the shelves from scratch, and it is how a new environment gets
  content before an admin exists.
- Three new tables (`admins`, `tags`, `title_tags`) and one function are
  hand-written into `lib/supabase/types.ts` in the shape `supabase gen types`
  emits, as the collections tables already are. Regenerating remains an
  outstanding task for an environment with Supabase credentials.
- Genre coverage grows with syncing, not all at once. Until `backfill:genres`
  runs, a catalog row is tagged only once one of its readers syncs again.
