# Admin-Managed Curated Collections and Tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give one named admin the ability to manage curated `/discover`
collections and a tag vocabulary through the app, with MAL genres imported
automatically into that same vocabulary.

**Architecture:** An `admins` table whose safety comes from having no write
policy at all, checked by a `security definer` function that RLS policies call.
Admin capability is added as *parallel* permissive policies on the existing
`collections` tables, scoped `owner_id is null`, so user policies are untouched.
Tags live in a `tags` table with a `title_tags` join; MAL genres are inserted
with `on conflict (mal_genre_id) do nothing`, so MAL can create a tag but never
modify one. All editing UI lives under `/admin`; `/discover` is not modified.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions),
React 19 (`useActionState`), Supabase (Postgres + RLS + PostgREST), Zod 4,
Tailwind v4 + shadcn/ui, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-08-admin-collections-and-tags-design.md`

## Global Constraints

- **Read the Next.js docs before writing route or action code.** Per
  `AGENTS.md`, this is not the Next.js in your training data. The guides are in
  `node_modules/next/dist/docs/`, resolved from the repo root. Heed deprecation
  notices.
- **Every server action opens with `verifySession()` or `verifyAdmin()`.**
  Server actions are independently reachable HTTP endpoints; a check in a
  layout does not protect them.
- **Action state shape is `{ error?: string; message?: string } | null`**,
  matching `app/actions/collections.ts`. Do not introduce a second convention.
- **RLS conventions:** `to authenticated` (never `auth.role()`),
  `(select auth.uid())` so it is evaluated once per statement, and both `using`
  and `with check` on every UPDATE policy.
- **`server-only` modules must not be imported by client components** — not
  even for types. Types are erased at build time but Vitest follows the import
  at runtime. Pure shapes go in a sibling module, as
  `lib/data/collection-items.ts` sits beside `lib/data/collections.ts`.
- **Migrations are append-only.** Never edit
  `20260908000000_collections.sql` or any earlier file.
- **`lib/supabase/types.ts` is hand-maintained** in this environment, in the
  shape `supabase gen types` emits. Add new tables to it by hand; regenerating
  is an outstanding task for an environment with Supabase credentials.
- Commit after every task. Run `yarn test` and `yarn lint` before each commit.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260909000000_admins_and_tags.sql` | `admins`, `private.is_admin()`, `tags`, `title_tags`, their RLS |
| `supabase/migrations/20260909000001_admin_collection_policies.sql` | Parallel admin policies on `collections` and `collection_items` |
| `lib/data/tag-items.ts` | Pure, client-importable tag shapes and ordering |
| `lib/data/tags.ts` | `server-only` tag reads |
| `lib/data/admin.ts` | `server-only` reads for admin surfaces |
| `app/actions/tags.ts` | Tag CRUD + tag/untag a title |
| `app/actions/admin-collections.ts` | Curated collection CRUD + items |
| `app/admin/layout.tsx` | `verifyAdmin()` gate + admin nav |
| `app/admin/page.tsx` | Admin index |
| `app/admin/collections/page.tsx` | Curated collection list |
| `app/admin/collections/[id]/page.tsx` | One collection's items |
| `app/admin/tags/page.tsx` | Tag list |
| `app/admin/tags/[id]/page.tsx` | One tag's titles |
| `app/discover/tag/[slug]/page.tsx` | Reader-facing tag browse |
| `components/admin/*.tsx` | Admin forms, pickers, dialogs |
| `scripts/grant-admin.ts` | Service-role admin bootstrap |
| `scripts/backfill-genres.ts` | One-off genre import for existing catalog rows |

**Modified:**

| File | Change |
|---|---|
| `lib/auth/dal.ts` | Add `isAdmin()` and `verifyAdmin()` |
| `lib/mal/endpoints.ts:17` | Add `genres` to `LIST_FIELDS` |
| `lib/mal/types.ts` | Optional `genres` on `malMangaNodeSchema` |
| `lib/sync/sync-list.ts` | Write genre tags and `title_tags` |
| `lib/supabase/types.ts` | Hand-add the three new tables |
| `proxy.ts:19-25` | Add `/admin` to `PROTECTED_PREFIXES` |
| `package.json` | `grant:admin`, `backfill:genres` scripts |
| `TODO.md` | MAL title search; merging MAL genres into one tag |

---

## Task 1: The admins table and `is_admin()`

**Files:**
- Create: `supabase/migrations/20260909000000_admins_and_tags.sql`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.admins (user_id uuid pk, role text, granted_at
  timestamptz)`; function `private.is_admin() returns boolean`; tables
  `public.tags` and `public.title_tags` as specified below. Later tasks call
  `private.is_admin()` from policies and read these tables by name.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260909000000_admins_and_tags.sql`:

```sql
-- Admin capability, and the tag vocabulary it manages.
--
-- The admins table has no insert, update, or delete policy, and that absence
-- IS the security model: RLS denies by default, so no request carrying a
-- user's JWT can grant admin — not a forged one, not a bug in a route
-- handler. Rows are written by the service role only, via
-- `yarn grant:admin <email>`.
--
-- This is the same reasoning that makes curated collections unwritable today:
-- safety from the absence of a permitting policy, rather than from a check
-- somebody has to remember to write.
--
-- `role` lives here rather than on `profiles` so there is exactly one door.
-- Two independent grants would mean two places to audit and a revocation that
-- is easy to half-finish.

create table public.admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  -- Nothing reads this yet. It exists so 'editor' can be distinguished from
  -- 'admin' later without a new table.
  role       text not null default 'admin' check (role in ('admin', 'editor')),
  granted_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- An admin may confirm their own row, which is how the UI asks "am I one".
-- Deliberately not `using (true)`: the roster is not public.
create policy admins_select_self on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policy. See the header comment.

-- security definer so policies need not grant callers select on other rows of
-- admins. stable so the planner calls it once per statement, not per row.
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

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
-- Tags are a table, not free text on the join row. Strings become "Enemies to
-- Lovers", "enemies to lovers" and "Enemies-to-Lovers" within a month, and
-- renaming one would mean rewriting every row. A table makes rename a one-row
-- update and gives each tag a slug, a description and a page.

create table public.tags (
  id           bigint generated always as identity primary key,
  slug         text not null unique,
  name         text not null,
  description  text,
  -- Lets "Romance" (a genre MAL knows) and "Enemies to Lovers" (a trope it
  -- does not) live in one table and be grouped separately in the UI.
  kind         text not null default 'trope'
                 check (kind in ('genre', 'trope', 'theme', 'format')),
  -- Provenance, NOT a sync target. Records which MAL genre first caused this
  -- row to exist; null for tags invented here. Sync inserts with
  -- `on conflict (mal_genre_id) do nothing`, so MAL can bring a tag into
  -- existence and can never modify one that exists. That is what makes a
  -- locally renamed tag survive every later sync, and why there is no
  -- display_name shadow column and no read-only class of tag.
  mal_genre_id bigint unique,
  sort_order   int not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tags_kind_idx on public.tags (kind, sort_order);

create trigger tags_touch_updated_at
  before update on public.tags
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- title_tags
-- ---------------------------------------------------------------------------

create table public.title_tags (
  id         bigint generated always as identity primary key,
  -- cascade, unlike collection_items.title_id which restricts. A tag is an
  -- annotation, and losing an annotation when its subject disappears is
  -- correct. A collection item is content somebody assembled, so it blocks
  -- the delete instead.
  title_id   bigint not null references public.media_titles (id) on delete cascade,
  tag_id     bigint not null references public.tags (id) on delete cascade,
  -- Always null for now: curated, global. Nullable from the start so private
  -- user tags are a policy change later rather than a table rewrite.
  owner_id   uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Postgres treats NULLs as distinct, so this already permits one curated row
  -- plus one private row per user per title.
  constraint title_tags_uniq unique (title_id, tag_id, owner_id)
);

create index title_tags_title_idx on public.title_tags (title_id);
create index title_tags_tag_idx   on public.title_tags (tag_id);
create index title_tags_owner_idx on public.title_tags (owner_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tags       enable row level security;
alter table public.title_tags enable row level security;

-- Readable by every signed-in user. is_active is presentation and is filtered
-- by the data layer, not here — the same call collections makes.
create policy tags_select_all on public.tags
  for select to authenticated
  using (true);

create policy tags_insert_admin on public.tags
  for insert to authenticated
  with check (private.is_admin());

create policy tags_update_admin on public.tags
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy tags_delete_admin on public.tags
  for delete to authenticated
  using (private.is_admin());

-- Curated rows (null owner) are visible to all; a private row, when that
-- feature lands, is visible only to its owner.
create policy title_tags_select_visible on public.title_tags
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy title_tags_insert_admin on public.title_tags
  for insert to authenticated
  with check (owner_id is null and private.is_admin());

create policy title_tags_delete_admin on public.title_tags
  for delete to authenticated
  using (owner_id is null and private.is_admin());
```

- [ ] **Step 2: Verify the migration applies**

If a local Postgres is available, apply all migrations in order to a fresh
database and confirm no errors. Otherwise verify syntax by inspection against
`20260908000000_collections.sql`, which uses the same idioms.

Expected: clean apply, three new tables, one new function.

- [ ] **Step 3: Hand-add the tables to `lib/supabase/types.ts`**

Follow the exact shape the CLI emits for the existing `collections` entry —
`Row`, `Insert`, `Update`, and `Relationships`. `admins.user_id` relates to
`profiles.id`; `title_tags.title_id` to `media_titles.id`; `title_tags.tag_id`
to `tags.id`.

- [ ] **Step 4: Verify types compile**

Run: `yarn build`
Expected: TypeScript clean. (`yarn lint` does not type-check.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260909000000_admins_and_tags.sql lib/supabase/types.ts
git commit -m "feat: admins table, is_admin(), and the tag vocabulary"
```

---

## Task 2: Admin policies on curated collections

**Files:**
- Create: `supabase/migrations/20260909000001_admin_collection_policies.sql`

**Interfaces:**
- Consumes: `private.is_admin()` from Task 1.
- Produces: admins may write `collections` and `collection_items` rows whose
  `owner_id is null`. No new tables or functions.

- [ ] **Step 1: Write the migration**

```sql
-- Admin writes on curated collections.
--
-- The existing user policies are NOT modified. Postgres ORs permissive
-- policies together, so this adds a second door that only an admin can open,
-- leaving `collections_insert_own` and its siblings exactly as they are.
--
-- Every policy here carries `owner_id is null`: admin means editorial power
-- over curated rows, never over a user's private collection. That scoping is
-- the point, not an incidental detail.
--
-- private.collection_items_guard() needs no change. It derives owner_id from
-- the parent collection, so an admin inserting into a curated collection has a
-- null owner_id written for them — exactly what these checks require.

create policy collections_insert_curated on public.collections
  for insert to authenticated
  with check (owner_id is null and private.is_admin());

create policy collections_update_curated on public.collections
  for update to authenticated
  using (owner_id is null and private.is_admin())
  with check (owner_id is null and private.is_admin());

create policy collections_delete_curated on public.collections
  for delete to authenticated
  using (owner_id is null and private.is_admin());

create policy collection_items_insert_curated on public.collection_items
  for insert to authenticated
  with check (owner_id is null and private.is_admin());

create policy collection_items_update_curated on public.collection_items
  for update to authenticated
  using (owner_id is null and private.is_admin())
  with check (owner_id is null and private.is_admin());

create policy collection_items_delete_curated on public.collection_items
  for delete to authenticated
  using (owner_id is null and private.is_admin());
```

- [ ] **Step 2: Verify RLS behaviour against real Postgres**

This is the task's real test and must not be skipped. Apply every migration to
a scratch database, create two users, insert one into `admins` with the service
role, then assert as each:

| As | Action | Expected |
|---|---|---|
| non-admin | `select private.is_admin()` | `false` |
| non-admin | insert a curated `collections` row (`owner_id` null) | refused |
| non-admin | update a curated row's name | 0 rows affected |
| non-admin | insert into `tags` | refused |
| non-admin | insert into `title_tags` | refused |
| non-admin | insert self into `admins` | refused |
| admin | insert a curated `collections` row | succeeds, `owner_id` null |
| admin | insert `collection_items` into it | succeeds, `owner_id` null via guard |
| admin | update the *non-admin's* private collection | 0 rows affected |
| admin | delete the non-admin's private collection | 0 rows affected |
| admin | insert into `tags` and `title_tags` | succeeds |
| service | delete the admin's profile | `admins` row cascades; curated rows remain |

Record the transcript in the commit message or a scratch file. "0 rows
affected" and "refused" are different outcomes — RLS silently filters UPDATE
and DELETE rather than erroring, so assert the row count, not just the absence
of an error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909000001_admin_collection_policies.sql
git commit -m "feat: admin write policies on curated collections"
```

---

## Task 3: `isAdmin()` and `verifyAdmin()` in the DAL

**Files:**
- Modify: `lib/auth/dal.ts`
- Test: `tests/admin-dal.test.ts` (create)

**Interfaces:**
- Consumes: `verifySession()` from `lib/auth/dal.ts`; the `admins` table.
- Produces:
  - `isAdmin(): Promise<boolean>` — cached, never redirects.
  - `verifyAdmin(): Promise<{ userId: string }>` — calls `notFound()` when not
    an admin.

- [ ] **Step 1: Write the failing test**

Create `tests/admin-dal.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { maybeSingle, notFound } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: "user-1" } }, error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

describe("isAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("is true when the user has an admins row", async () => {
    maybeSingle.mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    const { isAdmin } = await import("@/lib/auth/dal");
    await expect(isAdmin()).resolves.toBe(true);
  });

  it("is false when the user has no admins row", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { isAdmin } = await import("@/lib/auth/dal");
    await expect(isAdmin()).resolves.toBe(false);
  });

  it("is false when the query errors, rather than throwing", async () => {
    // A failed admin check must deny, never crash the page or grant access.
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { isAdmin } = await import("@/lib/auth/dal");
    await expect(isAdmin()).resolves.toBe(false);
  });
});

describe("verifyAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("calls notFound for a non-admin rather than redirecting", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { verifyAdmin } = await import("@/lib/auth/dal");
    await expect(verifyAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("returns the user id for an admin", async () => {
    maybeSingle.mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    const { verifyAdmin } = await import("@/lib/auth/dal");
    await expect(verifyAdmin()).resolves.toEqual({ userId: "user-1" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `yarn test tests/admin-dal.test.ts`
Expected: FAIL — `isAdmin` is not exported from `@/lib/auth/dal`.

- [ ] **Step 3: Implement**

Append to `lib/auth/dal.ts`:

```ts
/**
 * Whether the signed-in user is an admin.
 *
 * Does not redirect: surfaces that merely *offer* an admin affordance need to
 * ask without throwing. Use verifyAdmin() to gate a page or an action.
 *
 * A failed query returns false. Denying on error is the only safe direction,
 * and the admins table is readable by its own row under admins_select_self, so
 * an error here means something is wrong rather than that access was refused.
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  const { userId } = await verifySession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return data !== null;
});

/**
 * Gates an admin page or server action.
 *
 * notFound(), not redirect(): a 404 does not confirm that /admin exists. And
 * this is defence in depth that produces a clean error — RLS is what actually
 * stops a forged request, since every admin write policy calls
 * private.is_admin() independently of anything decided here.
 */
export const verifyAdmin = cache(async (): Promise<{ userId: string }> => {
  const { userId } = await verifySession();
  if (!(await isAdmin())) notFound();
  return { userId };
});
```

Add `notFound` to the existing `next/navigation` import.

- [ ] **Step 4: Run the tests**

Run: `yarn test tests/admin-dal.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/dal.ts tests/admin-dal.test.ts
git commit -m "feat: isAdmin() and verifyAdmin() in the DAL"
```

---

## Task 4: `yarn grant:admin`

**Files:**
- Create: `scripts/grant-admin.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the `admins` table.
- Produces: a CLI, `yarn grant:admin <email>`. Nothing imports it.

- [ ] **Step 1: Write the script**

Model it on `scripts/seed-collections.ts` — same dotenv load, same service-role
client construction, same `SUPABASE_SECRET_KEY` env var.

```ts
/**
 * Grants admin to one account.
 *
 * Run: yarn grant:admin someone@example.com
 *
 * This is the ONLY way an admins row is created. The table has no insert
 * policy, so RLS refuses every request that carries a user's JWT; the service
 * role bypasses RLS, which is why this script exists and why there is no
 * "promote user" button anywhere in the app.
 *
 * Pass --revoke to remove the grant.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) throw new Error("Supabase env vars missing from .env.local");

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"));

if (!email) {
  console.error("Usage: yarn grant:admin <email> [--revoke]");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// auth.users is not reachable through PostgREST, so look the account up
// through the Admin API rather than a table read.
const { data: list, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw new Error(`Could not list users: ${listError.message}`);

const user = list.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);

if (!user) {
  console.error(`No account found for ${email}.`);
  process.exit(1);
}

if (revoke) {
  const { error } = await admin.from("admins").delete().eq("user_id", user.id);
  if (error) throw new Error(`Revoke failed: ${error.message}`);
  console.log(`Revoked admin from ${email}.`);
} else {
  const { error } = await admin
    .from("admins")
    .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id" });
  if (error) throw new Error(`Grant failed: ${error.message}`);
  console.log(`Granted admin to ${email}.`);
}
```

- [ ] **Step 2: Add the script to `package.json`**

Alongside the existing seed scripts, matching their exact flags:

```json
"grant:admin": "node --experimental-strip-types --no-warnings scripts/grant-admin.ts"
```

- [ ] **Step 3: Verify it runs**

Run: `yarn grant:admin` with no argument.
Expected: prints the usage line and exits 1 — confirms the script parses and
runs under `--experimental-strip-types` without needing a live database.

- [ ] **Step 4: Commit**

```bash
git add scripts/grant-admin.ts package.json
git commit -m "feat: yarn grant:admin"
```

---

## Task 5: Pure tag shapes (`lib/data/tag-items.ts`)

**Files:**
- Create: `lib/data/tag-items.ts`
- Test: `tests/tags.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Tag = { id: number; slug: string; name: string; description: string | null; kind: TagKind; mal_genre_id: number | null; sort_order: number; is_active: boolean }`
  - `type TagKind = "genre" | "trope" | "theme" | "format"`
  - `type TitleTag = { id: number; tag_id: number; title_id: number }`
  - `slugify(name: string): string`
  - `sortTags(tags: Tag[]): Tag[]`
  - `groupByKind(tags: Tag[]): { kind: TagKind; tags: Tag[] }[]`

This module is pure and carries **no** `server-only` import, because client
components import these types and Vitest follows the import at runtime. Same
reason `lib/data/collection-items.ts` exists.

- [ ] **Step 1: Write the failing test**

Create `tests/tags.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { groupByKind, slugify, sortTags, type Tag } from "@/lib/data/tag-items";

const tag = (over: Partial<Tag> & { id: number; name: string }): Tag => ({
  slug: slugify(over.name),
  description: null,
  kind: "trope",
  mal_genre_id: null,
  sort_order: 100,
  is_active: true,
  ...over,
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Enemies to Lovers")).toBe("enemies-to-lovers");
  });

  it("strips punctuation rather than encoding it", () => {
    expect(slugify("Sci-Fi & Fantasy!")).toBe("sci-fi-fantasy");
  });

  it("collapses runs of separators and trims them from the ends", () => {
    expect(slugify("  Boys'  Love  ")).toBe("boys-love");
  });

  it("keeps digits", () => {
    expect(slugify("Isekai 2")).toBe("isekai-2");
  });
});

describe("sortTags", () => {
  it("orders by sort_order, then name", () => {
    const sorted = sortTags([
      tag({ id: 1, name: "Romance", sort_order: 100 }),
      tag({ id: 2, name: "Action", sort_order: 100 }),
      tag({ id: 3, name: "Zombie", sort_order: 10 }),
    ]);
    expect(sorted.map((t) => t.name)).toEqual(["Zombie", "Action", "Romance"]);
  });

  it("does not mutate its argument", () => {
    const input = [
      tag({ id: 1, name: "B" }),
      tag({ id: 2, name: "A" }),
    ];
    sortTags(input);
    expect(input.map((t) => t.name)).toEqual(["B", "A"]);
  });
});

describe("groupByKind", () => {
  it("returns genres before tropes, and omits kinds with no tags", () => {
    const groups = groupByKind([
      tag({ id: 1, name: "Enemies to Lovers", kind: "trope" }),
      tag({ id: 2, name: "Romance", kind: "genre" }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["genre", "trope"]);
    expect(groups[0].tags.map((t) => t.name)).toEqual(["Romance"]);
  });

  it("sorts within each group", () => {
    const groups = groupByKind([
      tag({ id: 1, name: "Romance", kind: "genre" }),
      tag({ id: 2, name: "Action", kind: "genre" }),
    ]);
    expect(groups[0].tags.map((t) => t.name)).toEqual(["Action", "Romance"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `yarn test tests/tags.test.ts`
Expected: FAIL — cannot resolve `@/lib/data/tag-items`.

- [ ] **Step 3: Implement**

```ts
/**
 * Shapes and ordering for tags.
 *
 * Kept out of `tags.ts` because that module is `server-only`: the tag chips
 * and the admin editors are client-side, and the tests need this logic
 * directly. Types are erased at build time, but the test runner still follows
 * the import at runtime — the same reason `collection-items.ts` sits beside
 * `collections.ts`.
 */

export type TagKind = "genre" | "trope" | "theme" | "format";

/** Display order of the kinds. Genres first: they are the coarsest grouping. */
export const TAG_KINDS: TagKind[] = ["genre", "trope", "theme", "format"];

export type Tag = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  kind: TagKind;
  /** Non-null when MAL's genre list is what created this row. Provenance only. */
  mal_genre_id: number | null;
  sort_order: number;
  is_active: boolean;
};

export type TitleTag = { id: number; tag_id: number; title_id: number };

/**
 * A URL-safe handle for a tag name.
 *
 * Punctuation is stripped rather than percent-encoded, so "Sci-Fi & Fantasy"
 * becomes `sci-fi-fantasy` and not `sci-fi-%26-fantasy`. Slugs are unique in
 * the database, so a collision surfaces as a 23505 the caller reports.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Editorial order first, then alphabetical. Returns a new array. */
export function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
}

/**
 * Tags bucketed by kind, in TAG_KINDS order, each bucket sorted.
 *
 * Empty kinds are dropped: a heading with nothing under it is worse than no
 * heading.
 */
export function groupByKind(tags: Tag[]): { kind: TagKind; tags: Tag[] }[] {
  return TAG_KINDS.map((kind) => ({
    kind,
    tags: sortTags(tags.filter((t) => t.kind === kind)),
  })).filter((group) => group.tags.length > 0);
}
```

- [ ] **Step 4: Run the tests**

Run: `yarn test tests/tags.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/data/tag-items.ts tests/tags.test.ts
git commit -m "feat: pure tag shapes and ordering"
```

---

## Task 6: MAL genre import in sync

**Files:**
- Modify: `lib/mal/endpoints.ts:17`, `lib/mal/types.ts`, `lib/sync/sync-list.ts`
- Test: `tests/sync-genres.test.ts` (create)

**Interfaces:**
- Consumes: `slugify` from `lib/data/tag-items.ts` (Task 5); the `tags` and
  `title_tags` tables (Task 1).
- Produces: `syncGenres(admin, nodes, idMap): Promise<void>` exported from
  `lib/sync/sync-list.ts`, where `nodes` is `MalMangaNode[]` and `idMap` is
  `Map<number, number>` mapping MAL id → `media_titles.id`. Task 12's backfill
  script calls it.

- [ ] **Step 1: Write the failing test**

Create `tests/sync-genres.test.ts`. The critical case is the third: it pins the
`do nothing` contract that the whole ownership model rests on.

```ts
import { describe, expect, it, vi } from "vitest";

import { syncGenres } from "@/lib/sync/sync-list";

/** A Supabase-ish stub that records what each table was asked to do. */
function stubClient() {
  const calls: { table: string; op: string; rows: unknown; opts?: unknown }[] = [];
  const existingTags = [
    { id: 7, mal_genre_id: 22, slug: "romance", name: "Renamed By Hand" },
  ];

  return {
    calls,
    from(table: string) {
      return {
        upsert: (rows: unknown, opts?: unknown) => {
          calls.push({ table, op: "upsert", rows, opts });
          return Promise.resolve({ error: null });
        },
        insert: (rows: unknown) => {
          calls.push({ table, op: "insert", rows });
          return Promise.resolve({ error: null });
        },
        select: () => ({
          in: () => Promise.resolve({ data: existingTags, error: null }),
        }),
      };
    },
  };
}

const node = (id: number, genres?: { id: number; name: string }[]) => ({
  id,
  title: `Title ${id}`,
  genres,
});

describe("syncGenres", () => {
  it("creates a tag for each MAL genre and links it to the title", async () => {
    const client = stubClient();
    await syncGenres(
      client as never,
      [node(1, [{ id: 22, name: "Romance" }])],
      new Map([[1, 101]]),
    );

    const tagUpsert = client.calls.find((c) => c.table === "tags");
    expect(tagUpsert?.rows).toEqual([
      expect.objectContaining({
        mal_genre_id: 22,
        name: "Romance",
        slug: "romance",
        kind: "genre",
      }),
    ]);
  });

  it("never overwrites an existing tag — ignoreDuplicates, not merge", async () => {
    // The whole ownership model is this one option. If a future edit turns it
    // into a merging upsert, a locally renamed genre silently reverts on the
    // next sync, and nothing else in the suite would notice.
    const client = stubClient();
    await syncGenres(
      client as never,
      [node(1, [{ id: 22, name: "Romance" }])],
      new Map([[1, 101]]),
    );

    const tagUpsert = client.calls.find((c) => c.table === "tags");
    expect(tagUpsert?.opts).toMatchObject({
      onConflict: "mal_genre_id",
      ignoreDuplicates: true,
    });
  });

  it("does nothing when MAL omits genres", async () => {
    // MAL omits fields unpredictably; a missing genre list is normal and must
    // not fail the sync.
    const client = stubClient();
    await syncGenres(client as never, [node(1)], new Map([[1, 101]]));
    expect(client.calls).toEqual([]);
  });

  it("skips a title with no catalog id rather than writing a null title_id", async () => {
    const client = stubClient();
    await syncGenres(
      client as never,
      [node(99, [{ id: 22, name: "Romance" }])],
      new Map(),
    );
    expect(client.calls.find((c) => c.table === "title_tags")).toBeUndefined();
  });

  it("deduplicates a genre that appears on several titles", async () => {
    const client = stubClient();
    await syncGenres(
      client as never,
      [
        node(1, [{ id: 22, name: "Romance" }]),
        node(2, [{ id: 22, name: "Romance" }]),
      ],
      new Map([[1, 101], [2, 102]]),
    );

    const tagUpsert = client.calls.find((c) => c.table === "tags");
    expect(tagUpsert?.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `yarn test tests/sync-genres.test.ts`
Expected: FAIL — `syncGenres` is not exported.

- [ ] **Step 3: Add `genres` to the requested fields**

In `lib/mal/endpoints.ts`, line 17:

```ts
/** Fields requested for list entries — enough to render a card without extra calls. */
const LIST_FIELDS =
  "list_status,alternative_titles,main_picture,num_chapters,num_volumes,media_type,status,genres";
```

- [ ] **Step 4: Add `genres` to the node schema**

In `lib/mal/types.ts`, on `malMangaNodeSchema`. Optional, because the file's own
header warns that MAL omits fields unpredictably:

```ts
genres: z
  .array(z.object({ id: z.number(), name: z.string() }))
  .optional(),
```

- [ ] **Step 5: Implement `syncGenres`**

Add to `lib/sync/sync-list.ts`:

```ts
/**
 * Writes MAL's genres into the tag vocabulary.
 *
 * MAL seeds; the database owns. Tags are inserted with ignoreDuplicates on
 * mal_genre_id — `on conflict do nothing`, never `do update` — so MAL can
 * bring a tag into existence and can never modify one that already exists.
 * That is what lets an admin rename "Girls Love" and have the new name survive
 * every later sync, and why there is no display_name column and no read-only
 * class of tag: the conflict those would resolve cannot occur.
 *
 * The title_tags links ARE rewritten every sync, so a title newly given a
 * genre by MAL picks it up. Only the tag entity is frozen after creation.
 *
 * Runs as the service role, which bypasses RLS — this needs no admin and no
 * policy of its own.
 */
export async function syncGenres(
  admin: SupabaseClient<Database>,
  nodes: { id: number; genres?: { id: number; name: string }[] }[],
  idMap: Map<number, number>,
): Promise<void> {
  // Deduplicate by MAL genre id: the same genre appears on most titles.
  const genres = new Map<number, string>();
  for (const node of nodes) {
    for (const genre of node.genres ?? []) genres.set(genre.id, genre.name);
  }

  if (genres.size === 0) return;

  const { error: tagError } = await admin.from("tags").upsert(
    [...genres].map(([id, name]) => ({
      mal_genre_id: id,
      slug: slugify(name),
      name,
      kind: "genre" as const,
    })),
    { onConflict: "mal_genre_id", ignoreDuplicates: true },
  );

  if (tagError) throw new Error(`Genre upsert failed: ${tagError.message}`);

  // Read back to map MAL genre ids to tag ids. Necessary because
  // ignoreDuplicates means the upsert returns nothing for rows it skipped.
  const { data: tagRows, error: readError } = await admin
    .from("tags")
    .select("id, mal_genre_id")
    .in("mal_genre_id", [...genres.keys()]);

  if (readError) throw new Error(`Genre lookup failed: ${readError.message}`);

  const tagIds = new Map(
    (tagRows ?? [])
      .filter((row) => row.mal_genre_id !== null)
      .map((row) => [row.mal_genre_id as number, row.id]),
  );

  const links = [];
  for (const node of nodes) {
    const titleId = idMap.get(node.id);
    // No catalog row means the title upsert skipped it; a null title_id would
    // violate the not-null constraint rather than degrade.
    if (!titleId) continue;

    for (const genre of node.genres ?? []) {
      const tagId = tagIds.get(genre.id);
      if (!tagId) continue;
      links.push({ title_id: titleId, tag_id: tagId, owner_id: null });
    }
  }

  if (links.length === 0) return;

  for (const batch of chunk(links, BATCH_SIZE)) {
    const { error } = await admin
      .from("title_tags")
      .upsert(batch, {
        onConflict: "title_id,tag_id,owner_id",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Genre link failed: ${error.message}`);
  }
}
```

Add these imports at the top of `lib/sync/sync-list.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { slugify } from "@/lib/data/tag-items";
import type { Database } from "@/lib/supabase/types";
```

`chunk()` and `BATCH_SIZE` already exist in this file (lines 22 and 34) — reuse
them rather than declaring new ones.

- [ ] **Step 6: Call it from `syncList`**

Immediately after the `idMap` is populated (around `lib/sync/sync-list.ts:155`),
before the `user_entries` upsert:

```ts
// Genres are catalog-level facts, so they are written with the catalog rather
// than per user. A failure here must not fail the sync: the user's progress is
// the point of this function, and a missing genre tag is cosmetic.
try {
  await syncGenres(admin, collected.map((c) => c.node), idMap);
} catch (error) {
  console.error("Genre sync failed:", error);
}
```

- [ ] **Step 7: Run the full suite**

Run: `yarn test`
Expected: all passing, including the five new ones. Existing sync tests must
still pass — `LIST_FIELDS` changed, so check nothing asserts on its exact value.

- [ ] **Step 8: Commit**

```bash
git add lib/mal/endpoints.ts lib/mal/types.ts lib/sync/sync-list.ts tests/sync-genres.test.ts
git commit -m "feat: import MAL genres as tags during sync"
```

---

## Task 7: Tag reads (`lib/data/tags.ts`)

**Files:**
- Create: `lib/data/tags.ts`
- Test: covered by Task 5's pure tests plus Task 2's RLS verification; no new
  test file (this module is thin query wrapping, and mocking PostgREST chains
  tests the mock, not the code).

**Interfaces:**
- Consumes: `Tag`, `sortTags` from `lib/data/tag-items.ts`.
- Produces:
  - `getActiveTags(): Promise<Tag[]>`
  - `getTagBySlug(slug: string): Promise<Tag | null>`
  - `getTagsForTitle(titleId: number): Promise<Tag[]>`
  - `getTitlesForTag(tagId: number): Promise<CollectionTitle[]>`

- [ ] **Step 1: Implement**

```ts
import "server-only";

import type { CollectionTitle } from "@/lib/data/collection-items";
import { sortTags, type Tag } from "@/lib/data/tag-items";
import { createClient } from "@/lib/supabase/server";

/**
 * Tag reads.
 *
 * Every signed-in user may select from `tags` under tags_select_all, so these
 * use the request-scoped client. Writing requires private.is_admin(), which is
 * why the writes live in app/actions/tags.ts and not here.
 *
 * `is_active` is filtered here rather than in a policy: it is presentation,
 * not authorization — the same call `lib/data/collections.ts` makes.
 */

const TAG_COLUMNS =
  "id, slug, name, description, kind, mal_genre_id, sort_order, is_active";

export async function getActiveTags(): Promise<Tag[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(TAG_COLUMNS)
    .eq("is_active", true);

  if (error) throw new Error(`Failed to load tags: ${error.message}`);
  return sortTags((data ?? []) as Tag[]);
}

/**
 * One active tag by slug, for /discover/tag/[slug].
 *
 * Returns null for an unknown slug and for a retired tag alike, which the page
 * turns into a 404: is_active is how a tag is withdrawn, so a retired one
 * should stop being a page.
 */
export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(TAG_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load tag: ${error.message}`);
  return (data as Tag) ?? null;
}

/** Active tags on one title, for the entry page's chips. */
export async function getTagsForTitle(titleId: number): Promise<Tag[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("title_tags")
    .select(`tags!inner ( ${TAG_COLUMNS} )`)
    .eq("title_id", titleId)
    .is("owner_id", null);

  // Chips are a garnish; losing them should not take the entry page down.
  if (error) return [];

  return sortTags(
    ((data ?? []) as unknown as { tags: Tag }[])
      .map((row) => row.tags)
      .filter((tag) => tag.is_active),
  );
}

/**
 * Every catalog title carrying one tag.
 *
 * `media_titles!inner` makes the join inner, so a link whose catalog row went
 * missing drops out rather than arriving as a null every card must defend
 * against — the same shape COLLECTION_SELECT uses.
 */
export async function getTitlesForTag(
  tagId: number,
): Promise<CollectionTitle[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("title_tags")
    .select(
      `media_titles!inner (
         id, mal_media_id, title, title_en, main_picture_url,
         mal_media_kind, num_chapters, mal_status
       )`,
    )
    .eq("tag_id", tagId)
    .is("owner_id", null);

  if (error) throw new Error(`Failed to load titles: ${error.message}`);

  return ((data ?? []) as unknown as { media_titles: CollectionTitle }[])
    .map((row) => row.media_titles)
    .sort((a, b) => a.title.localeCompare(b.title));
}
```

- [ ] **Step 2: Verify the boundary and the build**

Run: `yarn test tests/rsc-boundary.test.ts && yarn build`
Expected: both pass. `tags.ts` is `server-only`, so nothing client-side may
import it — the pure types in `tag-items.ts` are what components name.

- [ ] **Step 3: Commit**

```bash
git add lib/data/tags.ts
git commit -m "feat: tag reads"
```

---

## Task 8: Tag actions (`app/actions/tags.ts`)

**Files:**
- Create: `app/actions/tags.ts`

**Interfaces:**
- Consumes: `verifyAdmin()` (Task 3), `slugify` (Task 5).
- Produces: `TagState = { error?: string; message?: string; tagId?: number } | null`,
  and the actions `createTag`, `updateTag`, `deleteTag`, `tagTitle`,
  `untagTitle` — each `(prev: TagState, formData: FormData) => Promise<TagState>`.

- [ ] **Step 1: Implement**

Mirror `app/actions/collections.ts` exactly in structure: `"use server"`, Zod
schemas at module scope, `verifyAdmin()` first in every action,
`revalidatePath` at the end, and 23505 mapped to a human sentence.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifyAdmin } from "@/lib/auth/dal";
import { slugify } from "@/lib/data/tag-items";
import { createClient } from "@/lib/supabase/server";

/**
 * The tag vocabulary.
 *
 * verifyAdmin() at the top of each is defence in depth that produces a clean
 * error — server actions are independently reachable HTTP endpoints. RLS is
 * what actually stops a forged request: every write policy on tags and
 * title_tags calls private.is_admin() independently of anything decided here.
 *
 * A tag created by MAL is an ordinary editable row. Nothing below special-cases
 * mal_genre_id, because nothing needs to: sync inserts with `do nothing`, so an
 * edit made here is never overwritten.
 */

export type TagState =
  | { error?: string; message?: string; tagId?: number }
  | null;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the tag a name.")
  .max(60, "Keep the name under 60 characters.");

const descriptionSchema = z
  .string()
  .trim()
  .max(200, "Keep the description under 200 characters.")
  .optional();

const kindSchema = z.enum(["genre", "trope", "theme", "format"]);
const idSchema = z.coerce.number().int().positive();

export async function createTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = z
    .object({
      name: nameSchema,
      description: descriptionSchema,
      kind: kindSchema,
    })
    .safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      kind: formData.get("kind") ?? "trope",
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .insert({
      slug: slugify(parsed.data.name),
      name: parsed.data.name,
      description: parsed.data.description || null,
      kind: parsed.data.kind,
      // Explicitly null: this tag was invented here, not imported. Leaving it
      // to the column default would be a silent dependency on that default.
      mal_genre_id: null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A tag with that name already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/tags");
  return { message: `Created “${parsed.data.name}”.`, tagId: data.id };
}

export async function updateTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = z
    .object({
      id: idSchema,
      name: nameSchema,
      description: descriptionSchema,
      kind: kindSchema,
      isActive: z.coerce.boolean(),
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      kind: formData.get("kind") ?? "trope",
      isActive: formData.get("is_active") === "on",
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // The slug is deliberately NOT recomputed from the new name: it is in URLs
  // (/discover/tag/<slug>), and silently breaking every existing link because
  // somebody fixed a typo would be worse than a slug that reads slightly
  // stale. Renaming the URL is a separate, explicit act.
  const { error } = await supabase
    .from("tags")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      kind: parsed.data.kind,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A tag with that name already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/tags");
  revalidatePath(`/admin/tags/${parsed.data.id}`);
  return { message: "Saved." };
}

export async function deleteTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { error: "That tag couldn't be deleted." };

  const supabase = await createClient();

  // title_tags cascades from tags, so one delete is enough. Note that deleting
  // a MAL-linked tag is not permanent: the next sync's `do nothing` insert
  // finds no row and re-creates it. Retiring (is_active = false) is the real
  // "stop showing this", which is why the UI leads with retire.
  const { error } = await supabase.from("tags").delete().eq("id", parsed.data);

  if (error) return { error: error.message };

  revalidatePath("/admin/tags");
  return { message: "Tag deleted." };
}

export async function tagTitle(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = z
    .object({ tagId: idSchema, titleId: idSchema })
    .safeParse({
      tagId: formData.get("tag_id"),
      titleId: formData.get("title_id"),
    });

  if (!parsed.success) return { error: "That title couldn't be tagged." };

  const supabase = await createClient();

  const { error } = await supabase.from("title_tags").insert({
    tag_id: parsed.data.tagId,
    title_id: parsed.data.titleId,
    // Explicitly null: curated. The insert policy requires it, and a private
    // user tag is a later feature with its own action.
    owner_id: null,
  });

  if (error) {
    // title_tags_uniq (title_id, tag_id, owner_id).
    if (error.code === "23505") return { error: "Already tagged." };
    return { error: error.message };
  }

  revalidatePath(`/admin/tags/${parsed.data.tagId}`);
  return { message: "Tagged." };
}

export async function untagTitle(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  await verifyAdmin();

  const parsed = z
    .object({ tagId: idSchema, titleId: idSchema })
    .safeParse({
      tagId: formData.get("tag_id"),
      titleId: formData.get("title_id"),
    });

  if (!parsed.success) return { error: "That tag couldn't be removed." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("title_tags")
    .delete()
    .eq("tag_id", parsed.data.tagId)
    .eq("title_id", parsed.data.titleId)
    .is("owner_id", null);

  if (error) return { error: error.message };

  revalidatePath(`/admin/tags/${parsed.data.tagId}`);
  return { message: "Removed." };
}
```

- [ ] **Step 2: Verify**

Run: `yarn lint && yarn build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/actions/tags.ts
git commit -m "feat: tag actions"
```

---

## Task 9: Curated collection actions

**Files:**
- Create: `app/actions/admin-collections.ts`

**Interfaces:**
- Consumes: `verifyAdmin()` (Task 3), `nextPosition` from
  `lib/data/collection-items.ts`.
- Produces: `AdminCollectionState = { error?: string; message?: string; collectionId?: number } | null`
  and the actions `createCuratedCollection`, `updateCuratedCollection`,
  `deleteCuratedCollection`, `addTitleToCurated`, `removeTitleFromCurated`,
  `moveCuratedItem`.

- [ ] **Step 1: Implement**

Same structure as `app/actions/collections.ts`. Three differences that matter,
each worth a comment in the file:

1. Every write sets or filters `owner_id: null` — these actions only ever touch
   curated rows, and RLS enforces the same via the Task 2 policies.
2. Curated rows **require** a slug (`collections_shape_ck`), so `createCurated`
   generates one with `slugify` and the form offers to override it.
3. `moveCuratedItem` swaps two items' `position` values. Positions are not
   unique by design, so a swap is two updates and needs no deferrable
   constraint.

```ts
export async function moveCuratedItem(
  _prev: AdminCollectionState,
  formData: FormData,
): Promise<AdminCollectionState> {
  await verifyAdmin();

  const parsed = z
    .object({
      collectionId: idSchema,
      itemId: idSchema,
      direction: z.enum(["up", "down"]),
    })
    .safeParse({
      collectionId: formData.get("collection_id"),
      itemId: formData.get("item_id"),
      direction: formData.get("direction"),
    });

  if (!parsed.success) return { error: "That title couldn't be moved." };

  const supabase = await createClient();

  const { data: items, error: readError } = await supabase
    .from("collection_items")
    .select("id, position")
    .eq("collection_id", parsed.data.collectionId)
    .order("position")
    .order("id");

  if (readError) return { error: readError.message };

  const ordered = items ?? [];
  const index = ordered.findIndex((row) => row.id === parsed.data.itemId);
  const swapWith = parsed.data.direction === "up" ? index - 1 : index + 1;

  // Already at the end it is being moved toward: succeed silently rather than
  // erroring, so a double-click on the top item is a no-op and not a toast.
  if (index === -1 || swapWith < 0 || swapWith >= ordered.length) {
    return null;
  }

  // Two updates, not one statement: `position` is deliberately not unique
  // (see the collections migration), so swapping needs no temporary value.
  const a = ordered[index];
  const b = ordered[swapWith];

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("collection_items").update({ position: b.position }).eq("id", a.id),
    supabase.from("collection_items").update({ position: a.position }).eq("id", b.id),
  ]);

  if (e1 || e2) return { error: (e1 ?? e2)!.message };

  revalidatePath(`/admin/collections/${parsed.data.collectionId}`);
  revalidatePath("/discover");
  return null;
}
```

Every action that changes curated content must `revalidatePath("/discover")` —
that page is the reason this feature exists, and it will otherwise serve stale
shelves.

- [ ] **Step 2: Verify**

Run: `yarn lint && yarn build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/actions/admin-collections.ts
git commit -m "feat: curated collection actions"
```

---

## Task 10: Admin reads and the `/admin` shell

**Files:**
- Create: `lib/data/admin.ts`, `app/admin/layout.tsx`, `app/admin/page.tsx`
- Modify: `proxy.ts:19-25`

**Interfaces:**
- Consumes: `verifyAdmin()` (Task 3).
- Produces:
  - `getAllCuratedCollections(): Promise<CollectionSummary[]>` — retired rows
    **included**, unlike `getCuratedShelves()`.
  - `getAllTags(): Promise<(Tag & { titleCount: number })[]>`
  - `getAdminCounts(): Promise<{ collections: number; tags: number; taggedTitles: number }>`

- [ ] **Step 1: Add `/admin` to the proxy**

`proxy.ts`, in `PROTECTED_PREFIXES`:

```ts
const PROTECTED_PREFIXES = [
  "/library",
  "/entry",
  "/settings",
  "/discover",
  "/collections",
  "/admin",
];
```

This is the optimistic cookie check only — it stops the signed-out flash. The
layout's `verifyAdmin()` is the actual gate.

- [ ] **Step 2: Write `lib/data/admin.ts`**

`server-only`. The important difference from `lib/data/collections.ts`:

```ts
/**
 * Every curated collection, retired ones included.
 *
 * Deliberately does NOT filter is_active, unlike getCuratedShelves(). Hiding a
 * retired collection from the person who retired it would leave no way to
 * bring it back.
 */
```

- [ ] **Step 3: Write `app/admin/layout.tsx`**

```tsx
import { AppShell } from "@/components/app-shell";
import { verifyAdmin } from "@/lib/auth/dal";

/**
 * The admin area.
 *
 * verifyAdmin() calls notFound() for everyone else, so /admin is a 404 rather
 * than a redirect — a redirect would confirm the route exists. This gate
 * covers the pages; each server action re-checks independently, because a
 * layout does not protect an action.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifyAdmin();
  return <AppShell>{children}</AppShell>;
}
```

Read `node_modules/next/dist/docs/` on layouts before writing this — layout
props and async layouts are among the things that differ in this version.

- [ ] **Step 4: Write `app/admin/page.tsx`**

An index: the three counts from `getAdminCounts()`, and links to
`/admin/collections` and `/admin/tags`.

- [ ] **Step 5: Verify the gate by running the app**

Run: `yarn dev`, then with **no** session:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin
```

Expected: `307` to `/auth/login`.

Then signed in as a non-admin: expect the 404 page, **and confirm the response
body is the 404 and not a partially streamed admin page**. This is exactly the
failure mode `/discover` hit last time — the redirect arrived after streaming
began. Check the body, not just the status.

- [ ] **Step 6: Commit**

```bash
git add lib/data/admin.ts app/admin proxy.ts
git commit -m "feat: /admin shell, gated by verifyAdmin"
```

---

## Task 11: Admin pages and components

**Files:**
- Create: `app/admin/collections/page.tsx`,
  `app/admin/collections/[id]/page.tsx`, `app/admin/tags/page.tsx`,
  `app/admin/tags/[id]/page.tsx`, `components/admin/*.tsx`
- Test: `tests/admin-tag-form.test.tsx` (create)

**Interfaces:**
- Consumes: everything from Tasks 7–10.
- Produces: no exports other tasks depend on.

- [ ] **Step 1: Write the component test first**

Create `tests/admin-tag-form.test.tsx`, following the mocking convention in
`tests/entry-collections.test.tsx` — `vi.hoisted` for the action mocks, then
`vi.mock("@/app/actions/tags", ...)`. Cover:

- Submitting a name calls `createTag` with that name in the FormData.
- An error state renders the message.
- The kind selector defaults to `trope`.

- [ ] **Step 2: Run it and watch it fail**

Run: `yarn test tests/admin-tag-form.test.tsx`
Expected: FAIL — the component does not exist.

- [ ] **Step 3: Build the components**

Each is a Client Component using `useActionState`. Reuse the patterns already
established:

- **Keyed forms, not synced refs.** `components/entry-collections.tsx` keys
  each toggle on its membership id so state resets without writing a ref during
  render. Do the same anywhere a form must reset after success. Writing a ref
  during render fails `react-hooks/refs` lint and is unsound under concurrent
  rendering.
- **One `useActionState` per independently-submittable thing.** A single shared
  dispatcher carries the previous result into the next submission.
- **A keyed inner form inside a dialog that stays mounted**, as
  `DeleteCollectionDialog` does — otherwise only the first delete toasts and
  the next dialog fires its effect on an unconfirmed row.

Components: `TagForm`, `TagList`, `TagTitlePicker`, `CuratedCollectionForm`,
`CuratedItemList` (with up/down buttons calling `moveCuratedItem`),
`CuratedTitlePicker` (searches `media_titles` — catalog only, per the spec).

- [ ] **Step 4: Run the tests**

Run: `yarn test`
Expected: everything passing, including `tests/rsc-boundary.test.ts` — no
function props may cross into a Client Component.

- [ ] **Step 5: Verify in the browser**

Run the app as an admin. Create a tag, rename it, retire it, tag a title,
create a curated collection, add two titles, reorder them, and confirm
`/discover` reflects the change (the actions revalidate it).

- [ ] **Step 6: Commit**

```bash
git add app/admin components/admin tests/admin-tag-form.test.tsx
git commit -m "feat: admin pages for collections and tags"
```

---

## Task 12: The reader-facing tag page and the backfill script

**Files:**
- Create: `app/discover/tag/[slug]/page.tsx`, `scripts/backfill-genres.ts`
- Modify: `package.json`, `TODO.md`

**Interfaces:**
- Consumes: `getTagBySlug`, `getTitlesForTag` (Task 7); `syncGenres` (Task 6).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the tag page**

A Server Component mirroring `app/discover/[slug]/page.tsx`. `notFound()` when
`getTagBySlug` returns null — which covers both an unknown slug and a retired
tag, since `is_active` is how a tag is withdrawn.

Use `PageProps<"/discover/tag/[slug]">` for the props type — this version of
Next.js generates those globally; do not hand-write a params type. Check
`node_modules/next/dist/docs/` if unsure.

- [ ] **Step 2: Write the backfill script**

```ts
/**
 * Imports MAL genres for catalog rows that predate the genre sync.
 *
 * Run: yarn backfill:genres
 *
 * Adding `genres` to LIST_FIELDS only tags a title the next time some user who
 * has it syncs, so rows already in media_titles stay untagged indefinitely.
 * This walks them and fetches each one directly.
 *
 * Needs a MAL token, so it runs against one connected account — any account
 * will do, since /manga/{id} is not list-scoped. One-off, not a scheduled job.
 *
 * MAL returns 403 for rate limiting, not 429 (see lib/mal/errors.ts), so the
 * pacing below is deliberate rather than superstitious.
 */
```

Walk `media_titles` in pages, call `getManga()` per title with a delay between
requests, collect the nodes, and hand them to `syncGenres` in batches with the
`idMap` built from the rows already read.

- [ ] **Step 3: Add the script to `package.json`**

```json
"backfill:genres": "node --experimental-strip-types --no-warnings scripts/backfill-genres.ts"
```

- [ ] **Step 4: Record the deferred work in `TODO.md`**

Two entries, each with its reasoning, in the style of the existing
"Recommended titles" section:

- **MAL title search for the admin pickers.** The pickers search
  `media_titles` only, so a curated shelf cannot yet include a title nobody
  tracks. Needs a MAL search endpoint plus a catalog-insert path, which today
  only `lib/sync/sync-list.ts` owns.
- **Merging several MAL genres into one tag.** `tags.mal_genre_id` is unique,
  so one tag carries at most one MAL genre. Collapsing "Romance" and "Love
  Polygon" into a single tag needs a `tag_mal_genres (tag_id, mal_genre_id)`
  join table — purely additive, and not yet known to be wanted.

- [ ] **Step 5: Full verification**

Run: `yarn test && yarn lint && yarn build`
Expected: all tests passing, lint clean, TypeScript clean.

Then run the app and check every route's signed-out behaviour:

```bash
for p in /library /entry/1 /settings /discover /collections /admin /discover/tag/romance; do
  printf "%s -> %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$p")"
done
```

Expected: `307` for every one.

- [ ] **Step 6: Commit**

```bash
git add app/discover/tag scripts/backfill-genres.ts package.json TODO.md
git commit -m "feat: browse by tag, and a genre backfill for existing catalog rows"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the admin gate → Tasks
1, 3, 4; tags schema → Task 1; MAL import and its `do nothing` contract →
Task 6; backfill → Task 12; admin policies → Task 2; surfaces → Tasks 10–12;
modules → Tasks 5, 7, 8, 9; the RLS test matrix → Task 2 Step 2; the sync tests
→ Task 6 Step 1. The two spec non-goals that need recording (MAL title search,
merging genres) are Task 12 Step 4.

**Type consistency.** `Tag`, `TagKind`, `TitleTag`, `slugify`, `sortTags`,
`groupByKind` are defined in Task 5 and used under those names in Tasks 6, 7, 8
and 11. `syncGenres(admin, nodes, idMap)` is defined in Task 6 and called with
that signature in Task 12. `isAdmin`/`verifyAdmin` are defined in Task 3 and
used in Tasks 8, 9, 10. Action state types are per-module (`TagState`,
`AdminCollectionState`) and both match the established
`{ error?, message? } | null` shape.

**Known gap, deliberate.** Task 11 describes components rather than giving
every line of their JSX. Their behaviour is pinned by the test in Step 1 and by
the four named patterns to reuse; writing out six components verbatim would
make this document longer than the code without making it more precise.
