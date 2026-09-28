# Pro Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-time "Pro" unlock, sold through the App Store (iOS app) and Stripe (web), that gates owned chapters, the random pick, and syncing to MyAnimeList *and* AniList at once — enforced by the database, honoured by both apps, with every account that exists at launch grandfathered in.

**Architecture:** One table, `pro_entitlements`, is the single source of truth: one row per Pro user, written only with the service-role key by the two purchase paths (a Stripe webhook, and an endpoint that verifies App Store transactions). Database triggers refuse the gated writes for non-Pro users, so every path — the web's server actions, the iOS app's endpoints, anything added later — is covered without a check in each. Both UIs read the same row to show upsells instead of controls that would fail.

**Tech Stack:** Supabase Postgres (triggers, RLS), Next.js 16 route handlers and server actions, `stripe` (Node), `@apple/app-store-server-library`, SwiftUI + StoreKit 2, Vitest, Swift Testing.

**Spec:** The decisions below, made with the product owner on 2026-09-24 (there is no separate spec document):

- Pro features: **owned chapters** (marking a source Owned, recording owned chapter ranges), the **random pick** (web library dice), and **syncing to both MyAnimeList and AniList**. Syncing to one of them stays free. Library filters and sort stay free.
- Payment: a **one-time unlock** (non-consumable), no subscription.
- Sold on **both** platforms: App Store IAP in the iOS app, Stripe Checkout on the web. Either purchase unlocks the account everywhere.
- Enforcement is **server-side**, not just in the UI.
- **Grandfather** every account that exists when the migration runs.

Two repos: `web:` paths are in `webtoon-source-tracker` (Next.js), `ios:` paths are in `WebtoonSourceTracker` (Xcode).

## Global Constraints

- Product id (App Store): `pro_unlock`. Entitlement sources: `grandfathered`, `app_store`, `stripe` — exactly these strings.
- Error code for "needs Pro" raised by the database: SQLSTATE `PT402` (PostgREST also turns this into HTTP 402). User-facing messages come from `web:lib/pro.ts`, never from the raw database error.
- New env vars (web, Vercel + `.env.local`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `APPLE_BUNDLE_ID=com.julieevanspersonalteam.WebtoonSourceTracker`, `APPLE_APP_APPLE_ID` (the numeric App Store id; needed for Production verification).
- A connection counts as **linked** when its row exists and `status <> 'disconnected'` — the same rule `app/settings/page.tsx` uses (`needs_reauth` still counts).
- Web conventions (from earlier plans, still binding): migrations are append-only; `lib/supabase/types.ts` is hand-maintained in `supabase gen types` shape; `server-only` modules are never imported by client components, not even for types; action state is `{ error?: string; message?: string } | null`; RLS uses `to authenticated` and `(select auth.uid())`; every server action and route handler checks the session itself.
- Run `yarn test` and `yarn lint` before each web commit; run the Xcode tests (`xcodebuild test -scheme WebtoonSourceTracker -destination 'platform=macOS'`) before each iOS commit. Commit after every task.
- iOS deployment target is 27.0; there is no iOS 27 simulator on the dev machine, so iOS tests run on macOS.

## Review Focus

1. **A refund after purchase.** A refunded Stripe payment should turn Pro off; the user keeps their existing owned data (read-only for owned fields) rather than losing it. → Task 6 test "revokes on refund", and Task 1's trigger only fires when owned fields *change*.
2. **The same App Store purchase claimed by a second app account** (same Apple ID, different login). Expected: refused with a clear message, not silently granting two accounts. → Task 7 test "refuses a transaction bought for another account".
3. **A non-Pro user editing an unrelated field on a source that is already owned** (e.g. after a refund). Expected: the edit saves; only changing the owned fields is refused. → Task 1 manual SQL check (d).
4. **Reconnecting a service whose connection expired** (`needs_reauth`) while the other is linked, for a non-Pro user created after launch. It's the same service being re-linked, not a second one — expected: allowed. → Task 1 trigger compares against the *other* table only; Task 4 test "allows relinking the service already linked".
5. **The Stripe webhook arriving after the success redirect.** Expected: the /pro page says the payment is being confirmed rather than claiming nothing was bought. → Task 6 `/pro?purchased=1` copy.

---

## File Structure

**web — created**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260928000000_pro_entitlements.sql` | Table, `private.has_pro()`, grandfathering, the two enforcement triggers |
| `lib/pro.ts` | Client-safe: `PRO_REQUIRED_CODE`, `isProRequired()`, user-facing messages |
| `lib/data/pro.ts` | `server-only`: `hasPro()`, `getIsPro()`, `canLinkService()` |
| `lib/stripe.ts` | `server-only`: the Stripe client |
| `lib/apple/verify-transaction.ts` | `server-only`: verify a StoreKit JWS, Production then Sandbox |
| `lib/apple/root-certs.ts` | Apple Root CA G3, base64 |
| `lib/data/grant-pro.ts` | `server-only`: the one function that writes `pro_entitlements` |
| `app/pro/page.tsx` | What Pro includes, status, buy button |
| `app/actions/pro.ts` | `startProCheckout()` server action |
| `app/api/stripe/webhook/route.ts` | Grants on `checkout.session.completed`, revokes on `charge.refunded` |
| `app/api/purchases/app-store/route.ts` | iOS posts a signed transaction; verified, then granted |
| `components/pro-teaser.tsx` | The small "part of Pro" link used in place of gated controls |
| `tests/pro.test.ts`, `tests/stripe-webhook.test.ts`, `tests/app-store-purchase.test.ts`, `tests/link-service-gate.test.ts` | New tests |

**web — modified:** `lib/supabase/types.ts`, `app/actions/entry-sources.ts`, `components/entry-source-editor.tsx`, `app/entry/[id]/page.tsx`, `components/random-pick.tsx`, `app/library/page.tsx`, `app/api/mal/connect/route.ts`, `app/api/anilist/connect/route.ts`, `app/api/mal/callback/route.ts`, `app/api/anilist/callback/route.ts`, `app/settings/page.tsx`, `tests/entry-source-editor.test.tsx`, `tests/random-pick.test.tsx`, `package.json`.

**ios — created:** `WebtoonSourceTracker/Models/ProStore.swift`, `WebtoonSourceTracker/Components/PaywallView.swift`, `WebtoonSourceTrackerTests/ProStoreTests.swift`.
**ios — modified:** `WebtoonSourceTracker/WebtoonSourceTracker.swift`, `WebtoonSourceTracker/Components/SourceEditorView.swift`, `WebtoonSourceTracker/Pages/SettingsView.swift`.

**Branching:** web work on a branch `pro-unlock` from `main`. The iOS app's source endpoints live on the unmerged `ios-app-sources` branch; the triggers in Task 1 cover those writes regardless, and Task 3 step 6 maps the error there once it merges. iOS work on a branch `pro-unlock` from the iOS repo's current branch.

---

## Part A — Entitlements and enforcement (web)

### Task 1: `pro_entitlements`, grandfathering, and the enforcement triggers

**Files:**
- Create: `web:supabase/migrations/20260928000000_pro_entitlements.sql`
- Modify: `web:lib/supabase/types.ts`

**Interfaces:**
- Produces: table `public.pro_entitlements(user_id uuid pk, source text, external_id text null, granted_at timestamptz, revoked_at timestamptz null)`; function `private.has_pro(uid uuid) returns boolean`; SQLSTATE `PT402` raised by triggers on `entry_sources`, `mal_connections`, `anilist_connections`.

- [ ] **Step 1: Write the migration**

```sql
-- Pro: a one-time unlock, bought on the App Store or through Stripe.
--
-- One row per Pro account, the single answer both apps read. Written only by
-- the service role (the Stripe webhook and the App Store endpoint), so there
-- are no insert/update policies: a user can read their row, never write it.
--
-- revoked_at rather than a delete: a refund turns Pro off, but the row is the
-- record of what was bought and refunded, and a later re-purchase clears it.

create table public.pro_entitlements (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  source      text not null check (source in ('grandfathered', 'app_store', 'stripe')),
  -- The store's id for the purchase: Stripe's payment intent, or the App
  -- Store's original transaction id. Null for grandfathered accounts.
  external_id text,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- One purchase unlocks one account: the same App Store transaction posted
-- from a second login must not grant a second row.
create unique index pro_entitlements_purchase_uniq
  on public.pro_entitlements (source, external_id)
  where external_id is not null;

alter table public.pro_entitlements enable row level security;

create policy pro_entitlements_select_own on public.pro_entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Takes the user id rather than reading auth.uid(): the connection triggers
-- fire under the service role, which has no auth.uid().
create or replace function private.has_pro(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.pro_entitlements
    where user_id = uid and revoked_at is null
  );
$$;

-- Everyone here before Pro existed keeps what they have.
insert into public.pro_entitlements (user_id, source)
select id, 'grandfathered' from public.profiles
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Owned chapters
-- ---------------------------------------------------------------------------
-- Refuses only a *change* that sets ownership. A non-Pro user (say, after a
-- refund) can still edit the link or notes of a source already marked owned,
-- and can always clear ownership.

create or replace function private.entry_sources_require_pro()
returns trigger
language plpgsql
-- Definer, like private.is_admin: it only reads, and this way the trigger
-- works under the authenticated role without schema grants on private.
security definer
set search_path = ''
as $$
begin
  if (new.is_owned or new.chapters_owned is not null)
     and (tg_op = 'INSERT'
          or new.is_owned is distinct from old.is_owned
          or new.chapters_owned is distinct from old.chapters_owned)
     and not private.has_pro(new.user_id)
  then
    raise exception 'Owned chapters are part of Pro.' using errcode = 'PT402';
  end if;
  return new;
end;
$$;

-- Named to sort after entry_sources_guard, which sets user_id from the
-- entry's owner; triggers of the same timing fire in name order.
create trigger entry_sources_z_require_pro
  before insert or update on public.entry_sources
  for each row execute function private.entry_sources_require_pro();

-- ---------------------------------------------------------------------------
-- Syncing to both services
-- ---------------------------------------------------------------------------
-- Linking one of MyAnimeList / AniList is free; linking the second while the
-- first is linked is Pro. Re-linking the same service (e.g. after
-- needs_reauth) touches only its own table, so it is never blocked here.

create or replace function private.connections_require_pro()
returns trigger
language plpgsql
-- Definer, like private.is_admin: it only reads, and this way the trigger
-- works under the authenticated role without schema grants on private.
security definer
set search_path = ''
as $$
declare
  other_linked boolean;
begin
  if new.status = 'disconnected' then
    return new;
  end if;

  if tg_table_name = 'mal_connections' then
    select exists (
      select 1 from public.anilist_connections
      where user_id = new.user_id and status <> 'disconnected'
    ) into other_linked;
  else
    select exists (
      select 1 from public.mal_connections
      where user_id = new.user_id and status <> 'disconnected'
    ) into other_linked;
  end if;

  if other_linked and not private.has_pro(new.user_id) then
    raise exception 'Syncing to both MyAnimeList and AniList is part of Pro.'
      using errcode = 'PT402';
  end if;
  return new;
end;
$$;

create trigger mal_connections_require_pro
  before insert or update of status on public.mal_connections
  for each row execute function private.connections_require_pro();

create trigger anilist_connections_require_pro
  before insert or update of status on public.anilist_connections
  for each row execute function private.connections_require_pro();
```

Before writing, confirm the guard trigger's name: `grep -n "create trigger" supabase/migrations/*.sql | grep entry_sources`. If it does not sort before `entry_sources_z_require_pro`, rename this trigger so it does.

- [ ] **Step 2: Add the table to `lib/supabase/types.ts`**

Inside `public: { Tables: { ... } }`, alphabetically, in the shape the file already uses for other tables:

```ts
      pro_entitlements: {
        Row: {
          user_id: string;
          source: "grandfathered" | "app_store" | "stripe";
          external_id: string | null;
          granted_at: string;
          revoked_at: string | null;
        };
        Insert: {
          user_id: string;
          source: "grandfathered" | "app_store" | "stripe";
          external_id?: string | null;
          granted_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          user_id?: string;
          source?: "grandfathered" | "app_store" | "stripe";
          external_id?: string | null;
          granted_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
```

- [ ] **Step 3: Verify against a local database**

There is no SQL test harness in this repo; verify by hand. Run `supabase start` and `supabase db reset`, then in `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')"`:

```sql
-- Setup: two users, one Pro, each with one entry and one source row.
-- (Create users through the local Studio or auth admin API, then:)
-- a) Non-Pro insert of an owned source fails with PT402:
insert into entry_sources (user_id, entry_id, source_id, is_owned)
values ('<free-user>', <free-entry>, 1, true);          -- ERROR: Owned chapters are part of Pro.
-- b) Pro user: same insert succeeds.
-- c) Non-Pro: linking AniList while MAL is linked fails:
insert into mal_connections (user_id, mal_user_id, mal_username) values ('<free-user>', 1, 'a');
insert into anilist_connections (user_id, anilist_user_id, anilist_username) values ('<free-user>', 1, 'a'); -- ERROR
-- d) Non-Pro editing notes on an already-owned row (insert it as postgres with the trigger disabled, or revoke Pro after inserting) succeeds:
update entry_sources set notes = 'x' where id = <owned-row>;  -- OK
-- e) Grandfathering: every profile present before the migration has a row.
select count(*) = (select count(*) from profiles) from pro_entitlements;
```

Expected: (a) and (c) raise `PT402`; (b), (d), (e) succeed/true.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260928000000_pro_entitlements.sql lib/supabase/types.ts
git commit -m "Add Pro entitlements, grandfather existing accounts, and enforce Pro in the database"
```

### Task 2: Reading Pro, and turning its error into words

**Files:**
- Create: `web:lib/pro.ts`, `web:lib/data/pro.ts`, `web:components/pro-teaser.tsx`
- Test: `web:tests/pro.test.ts`

**Interfaces:**
- Produces: `PRO_REQUIRED_CODE = "PT402"`; `isProRequired(error: { code?: string } | null | undefined): boolean`; `PRO_MESSAGES: { owned: string; sync: string; pick: string }`; `hasPro(supabase, userId): Promise<boolean>`; `getIsPro(): Promise<boolean>`; `canLinkService(supabase, userId, provider: "mal" | "anilist"): Promise<boolean>`; `<ProTeaser feature="owned" | "sync" | "pick" />`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pro.test.ts
import { describe, expect, it } from "vitest";

import { PRO_MESSAGES, isProRequired } from "@/lib/pro";

describe("isProRequired", () => {
  it("recognises the database's Pro error and nothing else", () => {
    expect(isProRequired({ code: "PT402" })).toBe(true);
    expect(isProRequired({ code: "23505" })).toBe(false);
    expect(isProRequired(null)).toBe(false);
    expect(isProRequired(undefined)).toBe(false);
  });

  it("has a message for each gated feature", () => {
    expect(Object.keys(PRO_MESSAGES).sort()).toEqual(["owned", "pick", "sync"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `yarn vitest run tests/pro.test.ts`
Expected: FAIL — cannot resolve `@/lib/pro`.

- [ ] **Step 3: Implement**

```ts
// lib/pro.ts
/**
 * What Pro gates, in words, and how to recognise the database refusing a
 * write for it. Client-safe: no server imports, so components can use it.
 *
 * The database raises SQLSTATE PT402 (see the pro_entitlements migration);
 * the messages here are what the user sees instead of that raw error.
 */
export const PRO_REQUIRED_CODE = "PT402";

export const PRO_MESSAGES = {
  owned: "Owned chapters are part of Pro.",
  sync: "Syncing to both MyAnimeList and AniList is part of Pro.",
  pick: "Random pick is part of Pro.",
} as const;

export type ProFeature = keyof typeof PRO_MESSAGES;

export function isProRequired(error: { code?: string } | null | undefined): boolean {
  return error?.code === PRO_REQUIRED_CODE;
}
```

```ts
// lib/data/pro.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/** Whether this account has Pro. RLS lets a user read only their own row. */
export async function hasPro(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("pro_entitlements")
    .select("user_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  return data !== null;
}

/** For server components: the signed-in user's Pro status. */
export async function getIsPro(): Promise<boolean> {
  const { userId } = await verifySession();
  return hasPro(await createClient(), userId);
}

/**
 * Whether linking `provider` is allowed: always with Pro, and without it only
 * while the *other* service is not linked. Mirrors the database trigger, so
 * the UI can send the user to /pro before an OAuth round trip that would fail.
 */
export async function canLinkService(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: "mal" | "anilist",
): Promise<boolean> {
  if (await hasPro(supabase, userId)) return true;
  const other = provider === "mal" ? "anilist_connections" : "mal_connections";
  const { data } = await supabase
    .from(other)
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return !data || data.status === "disconnected";
}
```

```tsx
// components/pro-teaser.tsx
import { Sparkles } from "lucide-react";
import Link from "next/link";

import { PRO_MESSAGES, type ProFeature } from "@/lib/pro";

/** Stands in for a control the user can't use without Pro. */
export function ProTeaser({ feature }: { feature: ProFeature }) {
  return (
    <Link
      href="/pro"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
    >
      <Sparkles className="size-4 text-brand" aria-hidden />
      {PRO_MESSAGES[feature]} <span className="font-medium text-foreground">Get Pro</span>
    </Link>
  );
}
```

- [ ] **Step 4: Run the test and the suite**

Run: `yarn vitest run tests/pro.test.ts && yarn test && yarn lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pro.ts lib/data/pro.ts components/pro-teaser.tsx tests/pro.test.ts
git commit -m "Read Pro status and name what it gates"
```

### Task 3: Gate owned chapters in the web editor

**Files:**
- Modify: `web:app/actions/entry-sources.ts`, `web:components/entry-source-editor.tsx`, `web:app/entry/[id]/page.tsx`
- Test: `web:tests/entry-source-editor.test.tsx`

**Interfaces:**
- Consumes: `isProRequired`, `PRO_MESSAGES`, `getIsPro`, `<ProTeaser feature="owned" />` (Task 2).
- Produces: `EntrySourceEditor` gains a required prop `isPro: boolean`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/entry-source-editor.test.tsx`, reusing the file's existing render helper and fixtures (and add `isPro` — i.e. `isPro={true}` — to every existing `render(<EntrySourceEditor ... />)` call, so the existing owned-field tests keep passing):

```tsx
it("offers Pro instead of the owned fields to a free account", async () => {
  render(<EntrySourceEditor entryId={1} sources={[]} catalog={catalog} isPro={false} />);
  await openAddForm(); // the file's existing helper that opens the add form; if it has none, click the "Add source" button as the other tests do
  expect(screen.queryByLabelText(/owned/i)).toBeNull();
  expect(screen.getByRole("link", { name: /get pro/i })).toHaveAttribute("href", "/pro");
});

it("shows the owned fields to a Pro account", async () => {
  render(<EntrySourceEditor entryId={1} sources={[]} catalog={catalog} isPro />);
  await openAddForm();
  expect(screen.getByLabelText(/owned/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to see them fail**

Run: `yarn vitest run tests/entry-source-editor.test.tsx`
Expected: FAIL — the owned field still renders for `isPro={false}`.

- [ ] **Step 3: Implement**

In `components/entry-source-editor.tsx`: add `isPro: boolean` to `EntrySourceEditor`'s props and pass it down to `AddSourceForm` and `EditSourceForm` (add `isPro: boolean` to each of their prop types). In each form, find the owned controls (`grep -n 'name="is_owned"\|name="chapters_owned"' components/entry-source-editor.tsx`) and wrap them:

```tsx
{isPro ? (
  <>
    {/* the existing is_owned checkbox and chapters_owned input, unchanged */}
  </>
) : (
  <ProTeaser feature="owned" />
)}
```

Import `ProTeaser` from `@/components/pro-teaser`. The editor is a client component; `pro-teaser.tsx` imports only `lib/pro.ts`, which is client-safe.

In `app/entry/[id]/page.tsx`, fetch `const isPro = await getIsPro();` alongside the page's other reads (add it to the existing `Promise.all` if there is one) and pass `isPro={isPro}` to both `<EntrySourceEditor` call sites (lines ~154 and ~274).

In `app/actions/entry-sources.ts`, in every place that returns `{ error: error.message }` after an `entry_sources` insert or update, check first:

```ts
if (isProRequired(error)) return { error: PRO_MESSAGES.owned };
```

- [ ] **Step 4: Run tests**

Run: `yarn test && yarn lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/entry-sources.ts components/entry-source-editor.tsx app/entry/[id]/page.tsx tests/entry-source-editor.test.tsx
git commit -m "Offer Pro in place of owned chapters for free accounts"
```

- [ ] **Step 6: When `ios-app-sources` merges** — in its `app/api/entries/[id]/sources` route handlers, map the error the same way before returning, with status 402: `if (isProRequired(error)) return Response.json({ ok: false, error: PRO_MESSAGES.owned }, { status: 402 });`. Commit separately.

### Task 4: Gate linking the second service

**Files:**
- Modify: `web:app/api/mal/connect/route.ts`, `web:app/api/anilist/connect/route.ts`, `web:app/api/mal/callback/route.ts`, `web:app/api/anilist/callback/route.ts`, `web:app/settings/page.tsx`
- Test: `web:tests/link-service-gate.test.ts`

**Interfaces:**
- Consumes: `canLinkService`, `isProRequired`, `PRO_MESSAGES`, `<ProTeaser feature="sync" />`; existing `userClientFromBearer`, `verifySession`, `createClient`.
- Produces: `POST /api/{mal,anilist}/connect` replies `402 { error }` when blocked; `GET` redirects to `/pro?need=sync`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/link-service-gate.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { canLinkService, userClientFromBearer } = vi.hoisted(() => ({
  canLinkService: vi.fn(async () => true),
  userClientFromBearer: vi.fn(async () => ({ supabase: {}, userId: "user-1" })),
}));

vi.mock("@/lib/data/pro", () => ({ canLinkService }));
vi.mock("@/lib/auth/app-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/app-link")>()),
  userClientFromBearer,
}));

import { POST as malConnect } from "@/app/api/mal/connect/route";
import { POST as anilistConnect } from "@/app/api/anilist/connect/route";

const request = () =>
  new Request("https://example.com/api/x/connect", {
    method: "POST",
    headers: { authorization: "Bearer good" },
  });

describe("linking a second service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses with 402 when the other service is linked and there is no Pro", async () => {
    canLinkService.mockResolvedValueOnce(false);
    const response = await anilistConnect(request());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: "Syncing to both MyAnimeList and AniList is part of Pro.",
    });
    expect(canLinkService).toHaveBeenCalledWith({}, "user-1", "anilist");
  });

  it("allows relinking the service already linked", async () => {
    // canLinkService only looks at the *other* table; true here stands for
    // "MAL is the one linked, and MAL is being relinked".
    const response = await malConnect(request());
    expect(response.status).toBe(200);
    expect(canLinkService).toHaveBeenCalledWith({}, "user-1", "mal");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `yarn vitest run tests/link-service-gate.test.ts`
Expected: FAIL — the POST routes still use `userIdFromBearer` and never call `canLinkService`.

- [ ] **Step 3: Implement**

In `app/api/mal/connect/route.ts` (and the same in `app/api/anilist/connect/route.ts` with `"anilist"`):

```ts
export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!(await canLinkService(user.supabase, user.userId, "mal"))) {
    return Response.json({ error: PRO_MESSAGES.sync }, { status: 402 });
  }

  const state = createAppState(user.userId);
  return Response.json({ url: buildAuthorizeUrl(appCodeVerifier(state), state) });
}
```

and change `GET()` to `GET(request: Request)`, then after `verifySession()`:

```ts
  if (!(await canLinkService(await createClient(), userId, "mal"))) {
    return NextResponse.redirect(new URL("/pro?need=sync", request.url));
  }
```

Replace the `userIdFromBearer` import with `userClientFromBearer` where it's no longer used. Import `canLinkService` from `@/lib/data/pro`, `PRO_MESSAGES` from `@/lib/pro`, `createClient` from `@/lib/supabase/server`.

In both callbacks, where `upsertError` is handled (mal `route.ts:131`, anilist `route.ts:105`), return the Pro message first — this is the backstop for a race between the connect check and the callback:

```ts
  if (upsertError) {
    if (isProRequired(upsertError)) return PRO_MESSAGES.sync;
    // …existing handling
```

In `app/settings/page.tsx`, fetch `getIsPro()` with the page's other reads. Where each service's Connect link renders (`~line 116` for MAL, and the AniList equivalent), when that service is not linked, the other one is, and `!isPro`, render `<ProTeaser feature="sync" />` instead of the Connect link.

- [ ] **Step 4: Run tests**

Run: `yarn test && yarn lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/mal app/api/anilist app/settings/page.tsx tests/link-service-gate.test.ts
git commit -m "Make syncing to both MyAnimeList and AniList a Pro feature"
```

### Task 5: Gate the random pick

**Files:**
- Modify: `web:components/random-pick.tsx`, `web:app/library/page.tsx`
- Test: `web:tests/random-pick.test.tsx`

**Interfaces:**
- Consumes: `<ProTeaser feature="pick" />`, `getIsPro`.
- Produces: `RandomPick({ isPro }: { isPro: boolean })`.

The random pick runs entirely in the browser over rows already on the page, so there is no server write to enforce — the UI gate is the whole gate, and that is fine: nothing is exposed that the user can't already see.

- [ ] **Step 1: Write the failing test**

Add to `tests/random-pick.test.tsx`, using the file's existing provider wrapper; update the existing renders to `<RandomPick isPro />`:

```tsx
it("offers Pro instead of the dice to a free account", () => {
  renderWithLibrary(<RandomPick isPro={false} />); // the file's existing wrapper
  expect(screen.queryByRole("button", { name: /surprise|pick/i })).toBeNull();
  expect(screen.getByRole("link", { name: /get pro/i })).toHaveAttribute("href", "/pro");
});
```

- [ ] **Step 2: Run to see it fail**

Run: `yarn vitest run tests/random-pick.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `components/random-pick.tsx`, rename the existing `export function RandomPick()` to `function RandomPicker()` (unchanged body — its hooks stay unconditional), and add:

```tsx
export function RandomPick({ isPro }: { isPro: boolean }) {
  return isPro ? <RandomPicker /> : <ProTeaser feature="pick" />;
}
```

In `app/library/page.tsx`, add `getIsPro()` to the page's `Promise.all` and render `<RandomPick isPro={isPro} />` (line ~219).

- [ ] **Step 4: Run tests**

Run: `yarn test && yarn lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/random-pick.tsx app/library/page.tsx tests/random-pick.test.tsx
git commit -m "Make the random pick a Pro feature"
```

---

## Part B — Buying Pro (web)

### Task 6: The /pro page, Stripe Checkout, and the webhook

**Files:**
- Create: `web:lib/stripe.ts`, `web:lib/data/grant-pro.ts`, `web:app/actions/pro.ts`, `web:app/pro/page.tsx`, `web:app/api/stripe/webhook/route.ts`
- Modify: `web:package.json` (`yarn add stripe`)
- Test: `web:tests/stripe-webhook.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `getIsPro`, `verifySession`, `PRO_MESSAGES`.
- Produces: `grantPro(userId: string, source: "app_store" | "stripe", externalId: string): Promise<{ error?: string }>`; `revokePro(source: "app_store" | "stripe", externalId: string): Promise<void>`; `startProCheckout(): Promise<void>` (redirects).

- [ ] **Step 1: Install**

Run: `yarn add stripe`

- [ ] **Step 2: Write the failing test**

```ts
// tests/stripe-webhook.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { constructEvent, grantPro, revokePro } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  grantPro: vi.fn(async () => ({})),
  revokePro: vi.fn(async () => {}),
}));

vi.mock("@/lib/stripe", () => ({ stripe: { webhooks: { constructEvent } } }));
vi.mock("@/lib/data/grant-pro", () => ({ grantPro, revokePro }));

import { POST } from "@/app/api/stripe/webhook/route";

const call = () =>
  POST(
    new Request("https://example.com/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("rejects a bad signature", async () => {
    constructEvent.mockImplementationOnce(() => {
      throw new Error("bad signature");
    });
    expect((await call()).status).toBe(400);
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("grants Pro for a paid checkout", async () => {
    constructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1", payment_status: "paid", payment_intent: "pi_1" } },
    });
    expect((await call()).status).toBe(200);
    expect(grantPro).toHaveBeenCalledWith("user-1", "stripe", "pi_1");
  });

  it("does not grant an unpaid checkout", async () => {
    constructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "user-1", payment_status: "unpaid", payment_intent: "pi_1" } },
    });
    await call();
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("revokes on refund", async () => {
    constructEvent.mockReturnValueOnce({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1" } },
    });
    expect((await call()).status).toBe(200);
    expect(revokePro).toHaveBeenCalledWith("stripe", "pi_1");
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `yarn vitest run tests/stripe-webhook.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 4: Implement**

```ts
// lib/stripe.ts
import "server-only";

import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
```

```ts
// lib/data/grant-pro.ts
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The only writer of pro_entitlements. Service role, because users must not
 * be able to grant themselves Pro; so user_id is always filtered explicitly.
 *
 * Re-granting an existing row (a re-purchase after a refund) clears
 * revoked_at. A grandfathered row is left alone: it already is Pro.
 */
export async function grantPro(
  userId: string,
  source: "app_store" | "stripe",
  externalId: string,
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("pro_entitlements")
    .select("source, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing && existing.revoked_at === null) return {};

  const { error } = await admin.from("pro_entitlements").upsert(
    { user_id: userId, source, external_id: externalId, granted_at: new Date().toISOString(), revoked_at: null },
    { onConflict: "user_id" },
  );
  if (error?.code === "23505") {
    return { error: "This purchase already unlocked Pro on another account." };
  }
  return error ? { error: error.message } : {};
}

/** A refund: turns off the Pro this purchase granted, if it is the one on record. */
export async function revokePro(source: "app_store" | "stripe", externalId: string) {
  await createAdminClient()
    .from("pro_entitlements")
    .update({ revoked_at: new Date().toISOString() })
    .eq("source", source)
    .eq("external_id", externalId);
}
```

```ts
// app/api/stripe/webhook/route.ts
import type Stripe from "stripe";

import { grantPro, revokePro } from "@/lib/data/grant-pro";
import { stripe } from "@/lib/stripe";

/**
 * Stripe's word on a purchase. The success redirect proves nothing — anyone
 * can load that URL — so Pro is granted only here, from a signed event.
 */
export async function POST(request: Request) {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      process.env.STRIPE_WEBHOOK_SECRET ?? "",
    );
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" && session.client_reference_id && typeof session.payment_intent === "string") {
      await grantPro(session.client_reference_id, "stripe", session.payment_intent);
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    if (typeof charge.payment_intent === "string") {
      await revokePro("stripe", charge.payment_intent);
    }
  }
  return new Response("ok");
}
```

```ts
// app/actions/pro.ts
"use server";

import { redirect } from "next/navigation";

import { verifySession } from "@/lib/auth/dal";
import { stripe } from "@/lib/stripe";

/** Sends the user to Stripe Checkout for the one-time Pro unlock. */
export async function startProCheckout() {
  const { userId } = await verifySession();
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
    // How the webhook knows whose purchase this is.
    client_reference_id: userId,
    success_url: `${site}/pro?purchased=1`,
    cancel_url: `${site}/pro`,
  });
  redirect(session.url!);
}
```

```tsx
// app/pro/page.tsx
import { Button } from "@/components/ui/button";
import { startProCheckout } from "@/app/actions/pro";
import { getIsPro } from "@/lib/data/pro";

export const metadata = { title: "Pro" };

export default async function ProPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string; need?: string }>;
}) {
  const [isPro, { purchased }] = await Promise.all([getIsPro(), searchParams]);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Pro</h1>
      <ul className="list-disc space-y-1 pl-5">
        <li>Record which chapters you own at each source</li>
        <li>Sync to MyAnimeList and AniList at the same time</li>
        <li>Random pick: let the library choose what to read next</li>
      </ul>
      <p className="text-muted-foreground">One payment, yours for good — on the web and in the iOS app.</p>

      {isPro ? (
        <p className="font-medium">You have Pro. Thank you!</p>
      ) : purchased ? (
        // The webhook can land a moment after this redirect.
        <p className="font-medium">Payment received — Pro turns on in a moment. Refresh if it hasn't.</p>
      ) : (
        <form action={startProCheckout}>
          <Button type="submit">Get Pro</Button>
        </form>
      )}
      <p className="text-sm text-muted-foreground">Also available as an in-app purchase in the iOS app.</p>
    </main>
  );
}
```

Read `node_modules/next/dist/docs/` for `searchParams` in Next 16 before writing the page (AGENTS.md), and adjust if the API differs. Match the page chrome (header, container classes) to `app/settings/page.tsx`.

- [ ] **Step 5: Run tests**

Run: `yarn test && yarn lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json yarn.lock lib/stripe.ts lib/data/grant-pro.ts app/actions/pro.ts app/pro app/api/stripe tests/stripe-webhook.test.ts
git commit -m "Sell Pro on the web through Stripe Checkout"
```

### Task 7: Verify App Store purchases

**Files:**
- Create: `web:lib/apple/root-certs.ts`, `web:lib/apple/verify-transaction.ts`, `web:app/api/purchases/app-store/route.ts`
- Modify: `web:package.json` (`yarn add @apple/app-store-server-library`)
- Test: `web:tests/app-store-purchase.test.ts`

**Interfaces:**
- Consumes: `grantPro` (Task 6), `userClientFromBearer`.
- Produces: `POST /api/purchases/app-store` with body `{ signedTransaction: string }` → `200 { ok: true }` | `4xx { error }`; `verifyTransaction(jws: string): Promise<VerifiedTransaction>` where `VerifiedTransaction = { productId: string; originalTransactionId: string; appAccountToken?: string; revoked: boolean }`.

- [ ] **Step 1: Install and embed the root certificate**

```bash
yarn add @apple/app-store-server-library
curl -sO https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
printf '// Apple Root CA - G3, from https://www.apple.com/certificateauthority/\nexport const APPLE_ROOT_CA_G3 = "%s";\n' "$(base64 -i AppleRootCA-G3.cer | tr -d '\n')" > lib/apple/root-certs.ts
rm AppleRootCA-G3.cer
```

Embedded as a string rather than read from disk, so the serverless bundle needs no file-tracing config.

- [ ] **Step 2: Write the failing test**

```ts
// tests/app-store-purchase.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyTransaction, grantPro, userClientFromBearer } = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  grantPro: vi.fn(async () => ({})),
  userClientFromBearer: vi.fn(async () => ({ supabase: {}, userId: "3f1c6a52-0000-4000-8000-000000000001" })),
}));

vi.mock("@/lib/apple/verify-transaction", () => ({ verifyTransaction }));
vi.mock("@/lib/data/grant-pro", () => ({ grantPro }));
vi.mock("@/lib/auth/app-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/app-link")>()),
  userClientFromBearer,
}));

import { POST } from "@/app/api/purchases/app-store/route";

const USER = "3f1c6a52-0000-4000-8000-000000000001";
const call = (body: unknown) =>
  POST(
    new Request("https://example.com/api/purchases/app-store", {
      method: "POST",
      headers: { authorization: "Bearer good" },
      body: JSON.stringify(body),
    }),
  );
const tx = (over: object = {}) => ({
  productId: "pro_unlock",
  originalTransactionId: "1000",
  appAccountToken: USER.toUpperCase(), // StoreKit sends uppercase UUIDs
  revoked: false,
  ...over,
});

describe("POST /api/purchases/app-store", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs a signed-in user", async () => {
    userClientFromBearer.mockResolvedValueOnce(null as never);
    expect((await call({ signedTransaction: "jws" })).status).toBe(401);
  });

  it("rejects a transaction Apple's signature doesn't verify", async () => {
    verifyTransaction.mockRejectedValueOnce(new Error("bad jws"));
    expect((await call({ signedTransaction: "jws" })).status).toBe(400);
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("rejects another product, or a refunded one", async () => {
    verifyTransaction.mockResolvedValueOnce(tx({ productId: "something_else" }));
    expect((await call({ signedTransaction: "jws" })).status).toBe(400);
    verifyTransaction.mockResolvedValueOnce(tx({ revoked: true }));
    expect((await call({ signedTransaction: "jws" })).status).toBe(400);
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("refuses a transaction bought for another account", async () => {
    verifyTransaction.mockResolvedValueOnce(tx({ appAccountToken: "11111111-1111-4111-8111-111111111111" }));
    expect((await call({ signedTransaction: "jws" })).status).toBe(403);
    expect(grantPro).not.toHaveBeenCalled();
  });

  it("grants Pro for a verified purchase", async () => {
    verifyTransaction.mockResolvedValueOnce(tx());
    const response = await call({ signedTransaction: "jws" });
    expect(response.status).toBe(200);
    expect(grantPro).toHaveBeenCalledWith(USER, "app_store", "1000");
  });

  it("passes on grantPro's refusal", async () => {
    verifyTransaction.mockResolvedValueOnce(tx());
    grantPro.mockResolvedValueOnce({ error: "This purchase already unlocked Pro on another account." });
    const response = await call({ signedTransaction: "jws" });
    expect(response.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `yarn vitest run tests/app-store-purchase.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 4: Implement**

```ts
// lib/apple/verify-transaction.ts
import "server-only";

import { Environment, SignedDataVerifier } from "@apple/app-store-server-library";

import { APPLE_ROOT_CA_G3 } from "./root-certs";

export type VerifiedTransaction = {
  productId: string;
  originalTransactionId: string;
  appAccountToken?: string;
  revoked: boolean;
};

function verifier(environment: Environment) {
  return new SignedDataVerifier(
    [Buffer.from(APPLE_ROOT_CA_G3, "base64")],
    true, // online revocation checks
    environment,
    process.env.APPLE_BUNDLE_ID ?? "",
    environment === Environment.PRODUCTION ? Number(process.env.APPLE_APP_APPLE_ID) : undefined,
  );
}

/**
 * Checks a StoreKit 2 transaction's JWS against Apple's certificate chain.
 * Production first, then Sandbox: TestFlight and App Review buy in the
 * sandbox but talk to the production server, as Apple's guidance expects.
 */
export async function verifyTransaction(jws: string): Promise<VerifiedTransaction> {
  let payload;
  try {
    payload = await verifier(Environment.PRODUCTION).verifyAndDecodeTransaction(jws);
  } catch {
    payload = await verifier(Environment.SANDBOX).verifyAndDecodeTransaction(jws);
  }
  return {
    productId: payload.productId ?? "",
    originalTransactionId: payload.originalTransactionId ?? "",
    appAccountToken: payload.appAccountToken,
    revoked: payload.revocationDate != null,
  };
}
```

```ts
// app/api/purchases/app-store/route.ts
import { z } from "zod";

import { verifyTransaction } from "@/lib/apple/verify-transaction";
import { userClientFromBearer } from "@/lib/auth/app-link";
import { grantPro } from "@/lib/data/grant-pro";

const bodySchema = z.object({ signedTransaction: z.string().min(1).max(20_000) });

/**
 * The iOS app posts each Pro transaction StoreKit hands it (a purchase, a
 * restore, or one arriving later through Transaction.updates). Verified here
 * against Apple's signature — the app's own say-so is never enough.
 *
 * The app buys with appAccountToken = the user's id, so a transaction can only
 * unlock the account that bought it.
 */
export async function POST(request: Request) {
  const user = await userClientFromBearer(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Missing transaction." }, { status: 400 });

  let tx;
  try {
    tx = await verifyTransaction(parsed.data.signedTransaction);
  } catch {
    return Response.json({ error: "Couldn't verify this purchase with Apple." }, { status: 400 });
  }
  if (tx.productId !== "pro_unlock" || tx.revoked) {
    return Response.json({ error: "This purchase isn't an active Pro unlock." }, { status: 400 });
  }
  if (tx.appAccountToken?.toLowerCase() !== user.userId.toLowerCase()) {
    return Response.json({ error: "This purchase belongs to another account." }, { status: 403 });
  }

  const { error } = await grantPro(user.userId, "app_store", tx.originalTransactionId);
  if (error) return Response.json({ error }, { status: 409 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 5: Run tests**

Run: `yarn test && yarn lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json yarn.lock lib/apple app/api/purchases tests/app-store-purchase.test.ts
git commit -m "Verify App Store purchases of Pro and grant it to the buyer's account"
```

---

## Part C — iOS

### Task 8: `ProStore`, the paywall, and the purchase flow

**Files:**
- Create: `ios:WebtoonSourceTracker/Models/ProStore.swift`, `ios:WebtoonSourceTracker/Components/PaywallView.swift`, `ios:WebtoonSourceTrackerTests/ProStoreTests.swift`
- Modify: `ios:WebtoonSourceTracker/WebtoonSourceTracker.swift`

**Interfaces:**
- Consumes: `POST api/purchases/app-store` (Task 7), `pro_entitlements` table (Task 1), `sendToWebApp`, `supabase`.
- Produces: `@Observable final class ProStore { var isPro: Bool; var product: Product?; func refresh() async; func purchase() async throws; func restore() async throws; func listenForTransactions() async; static func needsProToLink(_ provider: String, linked: Set<String>) -> Bool }`, injected with `.environment(proStore)`; `PaywallView(feature: String)`.

- [ ] **Step 1: Write the failing test**

```swift
// WebtoonSourceTrackerTests/ProStoreTests.swift
import Testing
@testable import WebtoonSourceTracker

struct ProStoreTests {
    @Test func linkingOneServiceIsFree() {
        #expect(!ProStore.needsProToLink("mal", linked: []))
        #expect(!ProStore.needsProToLink("anilist", linked: []))
    }

    @Test func linkingTheSecondServiceNeedsPro() {
        #expect(ProStore.needsProToLink("anilist", linked: ["mal"]))
        #expect(ProStore.needsProToLink("mal", linked: ["anilist"]))
    }

    @Test func relinkingTheSameServiceIsFree() {
        #expect(!ProStore.needsProToLink("mal", linked: ["mal"]))
    }
}
```

- [ ] **Step 2: Run to see it fail**

Run: `xcodebuild test -scheme WebtoonSourceTracker -destination 'platform=macOS' 2>&1 | grep -E "error:|TEST (SUCCEEDED|FAILED)"`
Expected: FAIL — `cannot find 'ProStore' in scope`.

- [ ] **Step 3: Implement**

```swift
// WebtoonSourceTracker/Models/ProStore.swift
import Foundation
import StoreKit
import Supabase

/// Whether this account has Pro, and buying it. The account's
/// `pro_entitlements` row is the answer — shared with the web app, and
/// covering a Stripe purchase or grandfathering as well as the App Store.
/// StoreKit only supplies transactions, which the web app verifies with
/// Apple before granting.
@Observable final class ProStore {
    static let productID = "pro_unlock"

    private(set) var isPro = false
    private(set) var product: Product?

    private struct Reply: Decodable { let ok: Bool? }

    /// Linking a second service while one is linked is Pro; re-linking the
    /// same one isn't. The database enforces the same rule.
    static func needsProToLink(_ provider: String, linked: Set<String>) -> Bool {
        !linked.subtracting([provider]).isEmpty
    }

    func refresh() async {
        let rows: [[String: String]]? = try? await supabase
            .from("pro_entitlements")
            .select("user_id")
            .is("revoked_at", value: nil)
            .limit(1)
            .execute()
            .value
        isPro = rows?.isEmpty == false
        if product == nil {
            product = try? await Product.products(for: [Self.productID]).first
        }
    }

    func purchase() async throws {
        guard let product else { return }
        // Binds the purchase to this account, so the server can refuse it
        // from any other login.
        let userID = try await supabase.auth.session.user.id
        let result = try await product.purchase(options: [.appAccountToken(userID)])
        if case .success(let verification) = result {
            try await submit(verification)
        }
    }

    /// Sends every Pro transaction this Apple ID holds to the server again.
    func restore() async throws {
        try await AppStore.sync()
        for await verification in Transaction.currentEntitlements {
            try await submit(verification)
        }
    }

    /// Transactions that finish outside `purchase()` — Ask to Buy approvals,
    /// a purchase interrupted by the app closing. Run once, for the app's life.
    func listenForTransactions() async {
        for await verification in Transaction.updates {
            try? await submit(verification)
        }
    }

    private func submit(_ verification: VerificationResult<Transaction>) async throws {
        guard case .verified(let transaction) = verification,
              transaction.productID == Self.productID
        else { return }
        let _: Reply = try await sendToWebApp(
            "api/purchases/app-store",
            body: ["signedTransaction": verification.jwsRepresentation]
        )
        // Only once the server has it: an unfinished transaction is
        // redelivered, so a failed post gets another chance.
        await transaction.finish()
        await refresh()
    }
}
```

```swift
// WebtoonSourceTracker/Components/PaywallView.swift
import StoreKit
import SwiftUI

/// What Pro includes, and buying it. `feature` names what the user just tried.
struct PaywallView: View {
    let feature: String
    @Environment(ProStore.self) private var pro
    @Environment(\.dismiss) private var dismiss
    @State private var isWorking = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(feature).font(.headline)
                } footer: {
                    Text("One payment, yours for good — here and on the web.")
                }
                Section("Pro includes") {
                    Label("Owned chapters at each source", systemImage: "bookmark")
                    Label("Sync to MyAnimeList and AniList together", systemImage: "arrow.triangle.2.circlepath")
                    Label("Random pick on the web", systemImage: "dice")
                }
                Section {
                    Button {
                        run { try await pro.purchase() }
                    } label: {
                        Text(pro.product.map { "Unlock Pro — \($0.displayPrice)" } ?? "Unlock Pro")
                    }
                    .disabled(pro.product == nil || isWorking)
                    Button("Restore purchase") { run { try await pro.restore() } }
                        .disabled(isWorking)
                }
            }
            .navigationTitle("Pro")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .task { await pro.refresh() }
            .onChange(of: pro.isPro) { _, isPro in if isPro { dismiss() } }
            .alert("Couldn't complete the purchase", isPresented: .constant(error != nil)) {
                Button("OK") { error = nil }
            } message: {
                Text(error ?? "")
            }
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        isWorking = true
        Task {
            defer { isWorking = false }
            do { try await work() } catch { self.error = error.localizedDescription }
        }
    }
}
```

In `WebtoonSourceTracker.swift`: add `@State private var pro = ProStore()`, attach to the `Group`:

```swift
            .environment(pro)
            .task { await pro.listenForTransactions() }
            .task(id: session?.user.id) { await pro.refresh() }
```

- [ ] **Step 4: Run tests**

Run: `xcodebuild test -scheme WebtoonSourceTracker -destination 'platform=macOS' 2>&1 | grep -E "error:|TEST (SUCCEEDED|FAILED)"`
Expected: `** TEST SUCCEEDED **`, and `grep "ProStoreTests" <log>` shows 3 passed.

- [ ] **Step 5: Commit**

```bash
git add WebtoonSourceTracker/Models/ProStore.swift WebtoonSourceTracker/Components/PaywallView.swift WebtoonSourceTracker/WebtoonSourceTracker.swift WebtoonSourceTrackerTests/ProStoreTests.swift
git commit -m "Buy Pro in the app, verified by the web app"
```

### Task 9: Gate owned chapters and the second service in the app

**Files:**
- Modify: `ios:WebtoonSourceTracker/Components/SourceEditorView.swift`, `ios:WebtoonSourceTracker/Pages/SettingsView.swift`

**Interfaces:**
- Consumes: `ProStore.isPro`, `ProStore.needsProToLink`, `PaywallView(feature:)`.

- [ ] **Step 1: Owned chapters** — in `SourceEditorView`, add `@Environment(ProStore.self) private var pro` and `@State private var showingPaywall = false`. Replace the Owned section (`Section { Toggle("Owned", …) … }`, ~line 129) with:

```swift
                Section {
                    if pro.isPro {
                        Toggle("Owned", isOn: $draft.isOwned)
                        if draft.isOwned {
                            TextField("Chapters owned", text: $draft.chaptersOwned, prompt: Text("e.g. 1-40, 55"))
                                .autocorrectionDisabled()
                        }
                    } else {
                        Button("Owned chapters — Pro") { showingPaywall = true }
                    }
                } footer: {
                    if pro.isPro && draft.isOwned {
                        Text("Leave blank if you own it but haven't counted chapters.")
                    }
                }
```

and on the Form: `.sheet(isPresented: $showingPaywall) { PaywallView(feature: "Owned chapters are part of Pro.") }`. A source that is already owned keeps its values in `draft` untouched, so saving other edits doesn't change ownership — the database allows that (Task 1).

- [ ] **Step 2: Second service** — in `SettingsView`, add the same `@Environment(ProStore.self) private var pro` and `@State private var showingPaywall = false`. In `connectionRow`, replace the Connect button with:

```swift
                Button("Connect") {
                    if !pro.isPro && ProStore.needsProToLink(provider, linked: Set(usernames.keys)) {
                        showingPaywall = true
                    } else {
                        Task { await connect(provider) }
                    }
                }
```

and on the Form: `.sheet(isPresented: $showingPaywall) { PaywallView(feature: "Syncing to both MyAnimeList and AniList is part of Pro.") }`. The server's 402 message (Task 4) still reaches the existing alert if the check here is ever stale.

- [ ] **Step 3: Build and test**

Run: `xcodebuild test -scheme WebtoonSourceTracker -destination 'platform=macOS' 2>&1 | grep -E "error:|TEST (SUCCEEDED|FAILED)"`
Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 4: Try it with a local StoreKit configuration** — in Xcode, File → New → File → StoreKit Configuration File, name it `Pro.storekit`, add a Non-Consumable with product id `pro_unlock`; Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration: `Pro.storekit`. Run the app and confirm: the Owned row shows "Owned chapters — Pro", the paywall shows the price, and Buy completes in the StoreKit sheet. The web app can't verify Xcode-signed transactions, so the post to `api/purchases/app-store` fails here with "Couldn't verify this purchase with Apple." — expected; verification is checked end-to-end in the Sandbox (Task 10).

- [ ] **Step 5: Commit**

```bash
git add WebtoonSourceTracker/Components/SourceEditorView.swift WebtoonSourceTracker/Pages/SettingsView.swift WebtoonSourceTracker/Pro.storekit
git commit -m "Offer Pro in place of owned chapters and a second linked service"
```

### Task 10: Store setup and rollout (manual, product owner)

Not code; each item is a prerequisite for going live, in order.

- [ ] **App Store Connect:** accept the Paid Apps agreement; create a Non-Consumable in-app purchase, product id `pro_unlock`, with a price and review screenshot; submit it with the next app version.
- [ ] **Stripe:** create a Product "Pro" with a one-time Price; add a webhook endpoint `https://webtoon-source-tracker.vercel.app/api/stripe/webhook` for `checkout.session.completed` and `charge.refunded`.
- [ ] **Vercel env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `APPLE_BUNDLE_ID`, `APPLE_APP_APPLE_ID`.
- [ ] **Sandbox check:** with a Sandbox Apple account on a device, buy Pro from a TestFlight build; confirm a `pro_entitlements` row with `source = 'app_store'` appears and owned chapters unlock. With Stripe test keys, buy on a preview deployment; confirm `source = 'stripe'`; refund it in the Stripe dashboard and confirm `revoked_at` is set.
- [ ] **Launch order:** apply the migration and deploy the web app **together** — the migration's moment is the grandfathering cutoff, and the triggers enforce from that moment, so the web UI's upsells must already be live. Then release the iOS version with the paywall.

---

## Deferred (known ceilings)

- **App Store refunds** revoke nothing yet: that needs App Store Server Notifications V2 (a second endpoint, `REFUND` → `revokePro("app_store", originalTransactionId)`). Add it before refund volume matters; `revokePro` is already shaped for it.
- **Family Sharing** stays off for `pro_unlock` (the App Store default); turning it on would need the appAccountToken check relaxed.
