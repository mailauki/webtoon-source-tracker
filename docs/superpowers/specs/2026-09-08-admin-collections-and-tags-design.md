# Admin-managed curated collections and tags

**Date:** 2026-09-08
**Status:** Approved, ready for planning

## Problem

Curated collections on `/discover` are content with no editor. They exist only
as literals in `scripts/seed-collections.ts`, applied with the service role,
because RLS gives them no other writer: the insert policy requires
`owner_id = (select auth.uid())` and `null` never equals a uuid. Adding a shelf
means editing TypeScript and running a script.

Separately, there is no way to group titles by trope. `media_titles` stores no
genre or tag data, and the MAL sync never requests the `genres` field. Even if
it did, MAL would not help with the groupings readers actually browse by:
"Enemies to Lovers" is a trope, not a MAL genre. MAL offers "Romance" and
"Drama"; it does not offer enemies-to-lovers, regression, villainess, or
system. That data is editorial no matter where it comes from.

## Goals

- One named admin (initially the project owner) can create, edit, retire, and
  populate curated collections through the app rather than through a script.
- Titles can carry tags — genres, tropes, themes, formats — assigned by that
  admin and visible to every reader.
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
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  kind        text not null default 'trope'
                check (kind in ('genre', 'trope', 'theme', 'format')),
  sort_order  int not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
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

RLS: any authenticated user selects (active rows filtered by the data layer,
as with `collections.is_active`); insert, update and delete require
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

## Testing

- **Vitest, pure logic:** tag shaping in `lib/data/tag-items.ts`, slug
  generation, ordering.
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
- Two new tables and one function are hand-written into
  `lib/supabase/types.ts` in the shape `supabase gen types` emits, as the
  collections tables already are. Regenerating remains an outstanding task for
  an environment with Supabase credentials.
