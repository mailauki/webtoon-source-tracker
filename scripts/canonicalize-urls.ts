/**
 * Rewrites already-stored source links into their canonical form.
 *
 * Run: yarn backfill:urls           (dry run — prints what would change)
 *      yarn backfill:urls --yes     (writes)
 *
 * app/actions/entry-sources.ts canonicalises every URL on the way in, but only
 * from the commit that added it. Rows saved before that keep whatever was
 * pasted — the `m.` host, the `http://`, the share sheet's `utm_` tail — and
 * those are exactly the links that show the blank in-app browser sheet on iOS
 * before handing off to the native app. See lib/data/canonical-url.ts for why.
 *
 * One-off, not a scheduled job: once this has run, the action keeps new rows
 * canonical and there is nothing left for it to find.
 *
 * Writes are gated behind --yes, unlike scripts/backfill-genres.ts. That one
 * fills in a column that was empty; this one overwrites hand-entered data that
 * exists nowhere else, so the default is to show the rewrite and stop.
 *
 * Like every script here it avoids `server-only` modules and tsconfig's "@/*"
 * alias, neither of which plain `node --experimental-strip-types` resolves —
 * hence the relative, extension-carrying import below. lib/data/canonical-url.ts
 * is pure and dependency-free precisely so this can share it rather than
 * reimplement it, which is the drift scripts/backfill-genres.ts had to accept.
 */
import { pathToFileURL } from "node:url";

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { canonicalUrl } from "../lib/data/canonical-url.ts";
// Type-only, so it is erased before Node resolves anything — same reasoning as
// scripts/backfill-genres.ts.
import type { Database } from "../lib/supabase/types";

// See scripts/backfill-genres.ts: a bare `ReturnType<typeof createClient>`
// collapses row types to `never`, so the generated Database type is pinned.
type SupabaseAdmin = ReturnType<typeof createClient<Database>>;

const PAGE_SIZE = 500;

/** One stored link, narrowed to what a rewrite decision reads. */
export type StoredLink = { id: number; url: string | null };

/** A link whose canonical form differs from what is stored. */
export type Rewrite = { id: number; from: string; to: string };

/**
 * The rows this backfill would touch.
 *
 * Exported and pure so tests/canonicalize-urls.test.ts can exercise the
 * decision without a Supabase client, the way backfill-genres.ts exports
 * syncGenresBatch. Rows already canonical are dropped here rather than written
 * back unchanged: an update would bump nothing but would still be an update,
 * and the point of the dry run is to show only what moves.
 */
export function planRewrites(rows: StoredLink[]): Rewrite[] {
  const rewrites: Rewrite[] = [];

  for (const row of rows) {
    if (!row.url) continue;
    const next = canonicalUrl(row.url);
    // A URL this cannot improve comes back as it went in (or merely trimmed),
    // and a blank one would mean storing "" where the column's convention is
    // null — neither is a rewrite worth making.
    if (!next || next === row.url) continue;
    rewrites.push({ id: row.id, from: row.url, to: next });
  }

  return rewrites;
}

async function main(admin: SupabaseAdmin, write: boolean): Promise<void> {
  let page = 0;
  let walked = 0;
  const rewrites: Rewrite[] = [];

  for (;;) {
    const { data: rows, error } = await admin
      .from("entry_sources")
      .select("id, url")
      .not("url", "is", null)
      .order("id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) throw new Error(`Could not read entry_sources: ${error.message}`);
    if (!rows?.length) break;

    walked += rows.length;
    rewrites.push(...planRewrites(rows));

    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  for (const rewrite of rewrites) {
    console.log(`#${rewrite.id}\n  - ${rewrite.from}\n  + ${rewrite.to}`);
  }

  if (!rewrites.length) {
    console.log(`${walked} links walked, all already canonical.`);
    return;
  }

  if (!write) {
    console.log(
      `\n${walked} links walked, ${rewrites.length} would be rewritten. ` +
        "Re-run with --yes to apply.",
    );
    return;
  }

  // One row at a time rather than an upsert: entry_sources rows carry columns
  // this script has no business restating (chapters_owned, the flags), and an
  // upsert would need all of them. A backfill is not in a hurry.
  let written = 0;
  for (const rewrite of rewrites) {
    const { error } = await admin
      .from("entry_sources")
      .update({ url: rewrite.to })
      .eq("id", rewrite.id);

    if (error) {
      // One row's failure should not strand the rest — nothing here marks a
      // row done, so the next run picks up whatever was missed.
      console.error(`#${rewrite.id} failed: ${error.message}`);
      continue;
    }
    written++;
  }

  console.log(`\n${walked} links walked, ${written} rewritten.`);
}

/**
 * Reads env, builds the real client, and runs main(). Split out so that no
 * side effect — not even reading .env.local — happens on import, which is what
 * lets the test import planRewrites. See scripts/backfill-genres.ts.
 *
 * `async` so that a missing env var rejects the returned promise rather than
 * throwing before the guard below can attach its .catch — which is the
 * difference between a one-line message and a stack trace.
 */
async function run(): Promise<void> {
  config({ path: ".env.local" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing from .env.local");

  const admin: SupabaseAdmin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await main(admin, process.argv.slice(2).includes("--yes"));
}

// Direct-run guard: true only when this file is the process's entry point,
// false when the test imports it.
//
// scripts/backfill-genres.ts uses `import.meta.main`, which is Node 24+. This
// compares entry points instead so the guard also holds on Node 22, where
// `import.meta.main` is undefined and it would silently never fire.
// `pathToFileURL` rather than a `file://` template: argv[1] is an OS path, and
// a space or a `#` in it would not survive being pasted into a URL.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
