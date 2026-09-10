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
 *
 * This script does NOT import lib/sync/sync-list.ts, lib/mal/client.ts, or any
 * other `server-only` module — same reason scripts/seed-collections.ts and
 * scripts/grant-admin.ts don't: those modules are marked `server-only`, which
 * throws on import outside Next's build (confirmed: it resolves to a stub
 * only under the "react-server" condition a bundler sets, and plain
 * `node --experimental-strip-types` sets neither that condition nor tsconfig's
 * "@/*" path mapping). Worse, lib/mal/client.ts's `MalClient` constructor uses
 * a TypeScript parameter property (`constructor(private readonly userId)`),
 * which Node's strip-only mode cannot parse at all — this is not just an
 * import-resolution problem, so no amount of relative-path rewriting fixes it
 * short of changing that class, which is out of scope for a backfill script.
 *
 * So the token read/refresh (lib/mal/token-store.ts + lib/mal/oauth.ts) and
 * the genre upsert (lib/sync/sync-list.ts's syncGenres) are reimplemented
 * below against the same tables and the same two RPCs, deliberately kept in
 * lockstep with those modules. If either changes shape, update both sides.
 *
 * syncGenresBatch below is exported and takes `admin` as a parameter so
 * tests/backfill-genres.test.ts can exercise it with a stub client without
 * ever running the rest of this script. That requires the direct-run guard
 * at the bottom (`import.meta.main`) to gate not just main()'s invocation but
 * ALL of this script's side effects — reading .env.local, validating env
 * vars, and constructing a real Supabase client all now happen inside
 * run(), called only under that guard. Importing this module does none of
 * that: it only defines functions and types.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
// Type-only: erased entirely by --experimental-strip-types before Node ever
// tries to resolve the module, so this does NOT hit the `server-only` /
// "@/*" path-mapping problems described above — those only bite real
// (value) imports. A relative path is used because tsconfig's "@/*" alias
// isn't set for plain `node`, same reason as everywhere else in this file.
import type { Database } from "../lib/supabase/types";

// `import.meta.main` is a real, stable Node API since v24 (verified against
// this repo's actual Node 25.2.1 runtime under --experimental-strip-types —
// see the guard at the bottom of this file), but this project pins
// "@types/node": "^20", whose ImportMeta declaration predates it. This
// augmentation only adds the missing type; it changes no runtime behaviour.
declare global {
  interface ImportMeta {
    readonly main: boolean;
  }
}

// `ReturnType<typeof createClient>` (no explicit generic) does NOT reproduce
// a usable type: createClient's Database/SchemaName type parameters have
// interdependent conditional defaults that only resolve correctly against a
// concrete call site, so a bare ReturnType collapses `.from(...)` row types
// to `never`. Pinning the real generated Database type (imported type-only
// above) both fixes that and gives this script the same row typing
// lib/supabase/admin.ts's createAdminClient gets — stronger than the `any`
// an untyped inline call would otherwise infer.
type SupabaseAdmin = ReturnType<typeof createClient<Database>>;

const TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";
const API_BASE = "https://api.myanimelist.net/v2";

const CATALOG_PAGE_SIZE = 500; // matches sync-list.ts's BATCH_SIZE
// Deliberate, not superstitious: MAL signals over-quota with 403, not 429
// (lib/mal/errors.ts), and lib/mal/client.ts's own retry logic does NOT retry
// a 403 — it throws immediately, on the theory that retrying over-quota only
// makes the quota worse. A per-title backfill walking the whole catalog is
// exactly the shape of workload that trips that limit, so this paces itself
// up front with a fixed delay between requests rather than reacting after the
// fact. 1 request/second is comfortably under MAL's documented burst limits
// for a script with no other traffic sharing the same app credentials.
const REQUEST_DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type StoredTokens = { access_token: string; refresh_token: string };

/** One connected account's tokens — see the header comment for why this
 *  duplicates lib/mal/token-store.ts rather than importing it. */
async function getAnyConnectedAccount(admin: SupabaseAdmin): Promise<{
  userId: string;
  tokens: StoredTokens;
}> {
  const { data: connections, error } = await admin
    .from("mal_connections")
    .select("user_id")
    .eq("status", "active")
    .limit(1);

  if (error) throw new Error(`Could not read mal_connections: ${error.message}`);

  const connection = connections?.[0];
  if (!connection) {
    throw new Error(
      "No active MyAnimeList connection found. Connect at least one account " +
        "(via /settings in the running app) before running this script — " +
        "/manga/{id} needs a real MAL access token, and this reads whichever " +
        "connected account is available; none is currently connected.",
    );
  }

  const { data: rows, error: tokenError } = await admin.rpc("mal_tokens_get", {
    p_user_id: connection.user_id,
  });

  if (tokenError) throw new Error(`Could not read MAL tokens: ${tokenError.message}`);

  const row = rows?.[0];
  if (!row) {
    throw new Error(
      `mal_connections marks ${connection.user_id} as active, but no tokens ` +
        "are stored for it. Reconnect that account and try again.",
    );
  }

  return {
    userId: connection.user_id,
    tokens: { access_token: row.access_token, refresh_token: row.refresh_token },
  };
}

/** Mirrors lib/mal/oauth.ts's refreshTokens, minus the parts this script never needs. */
async function refreshAccessToken(
  malClientId: string,
  malClientSecret: string,
  refreshToken: string,
): Promise<StoredTokens> {
  const body = new URLSearchParams({
    client_id: malClientId,
    client_secret: malClientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `MAL token refresh failed (${response.status}): ${await response.text()}`,
    );
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { access_token: json.access_token, refresh_token: json.refresh_token };
}

type MangaNode = {
  id: number;
  genres?: { id: number; name: string }[];
};

/**
 * Fetches one title directly from MAL. Mirrors lib/mal/endpoints.ts's
 * getManga + lib/mal/client.ts's 401-refresh handling, scoped to just what
 * this script needs (genres). Refreshes the token at most once per call — the
 * same bound lib/mal/client.ts uses — and persists the rotated refresh token,
 * since MAL invalidates the old one on every refresh.
 */
async function fetchGenres(
  admin: SupabaseAdmin,
  malClientId: string,
  malClientSecret: string,
  userId: string,
  tokens: StoredTokens,
  malMediaId: number,
): Promise<{ node: MangaNode; tokens: StoredTokens }> {
  let current = tokens;
  let refreshedOnce = false;

  for (;;) {
    const url = new URL(`${API_BASE}/manga/${malMediaId}`);
    url.searchParams.set("fields", "genres");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${current.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      const node = (await response.json()) as MangaNode;
      return { node, tokens: current };
    }

    if (response.status === 401 && !refreshedOnce) {
      refreshedOnce = true;
      current = await refreshAccessToken(malClientId, malClientSecret, current.refresh_token);
      const { error } = await admin.rpc("mal_tokens_upsert", {
        p_user_id: userId,
        p_access_token: current.access_token,
        p_refresh_token: current.refresh_token,
        p_token_type: "Bearer",
        // Diagnostics only, same as lib/mal/token-store.ts — never used to
        // decide freshness.
        p_expires_at: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error(`Could not persist refreshed token: ${error.message}`);
      continue;
    }

    if (response.status === 403) {
      throw new Error(
        `MyAnimeList rate limit reached (403), stopped at mal_media_id ${malMediaId}. ` +
          "Re-run the script later: the genre upsert on tags.mal_genre_id is " +
          "`do nothing` and the title_tags link insert is deduped against " +
          "what's already there, so titles already processed cost nothing " +
          "extra on a re-run — only the fetch itself repeats.",
      );
    }

    throw new Error(
      `MAL request failed (${response.status}) for mal_media_id ${malMediaId}: ` +
        (await response.text()),
    );
  }
}

/**
 * Writes MAL genres into the tag vocabulary for one batch of nodes.
 *
 * This is syncGenres from lib/sync/sync-list.ts, copied rather than imported
 * — see the header comment. Kept byte-for-byte equivalent in behaviour: same
 * ignoreDuplicates upsert on mal_genre_id, same read-then-insert dedupe
 * against title_tags_curated_uniq (a partial unique index PostgREST's
 * on_conflict cannot target), same per-title insert grouping so one race
 * against a concurrent sync only costs that title's links, not the batch's.
 *
 * Exported (and taking `admin` as a parameter, mirroring syncGenres(admin,
 * nodes, idMap) in lib/sync/sync-list.ts) so tests/backfill-genres.test.ts
 * can drive it with a stub client without executing the rest of the script.
 */
export async function syncGenresBatch(
  admin: SupabaseAdmin,
  nodes: MangaNode[],
  idMap: Map<number, number>,
): Promise<void> {
  const genres = new Map<number, string>();
  for (const node of nodes) {
    for (const genre of node.genres ?? []) genres.set(genre.id, genre.name);
  }
  if (genres.size === 0) return;

  const slugify = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // Ownership contract: `ignoreDuplicates: true` is `on conflict do nothing`,
  // never `do update`. MAL may create a tag; it may never modify one that
  // already exists — that's what lets an admin rename a genre and have it
  // survive every future backfill. This line is the script's copy of the
  // same contract lib/sync/sync-list.ts's syncGenres enforces (see its
  // comment above the identical upsert); this copy is pinned by
  // tests/backfill-genres.test.ts. grep mal_genre_id to find the sibling.
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

  const links: { title_id: number; tag_id: number; owner_id: null }[] = [];
  for (const node of nodes) {
    const titleId = idMap.get(node.id);
    if (!titleId) continue;
    for (const genre of node.genres ?? []) {
      const tagId = tagIds.get(genre.id);
      if (!tagId) continue;
      links.push({ title_id: titleId, tag_id: tagId, owner_id: null });
    }
  }
  if (links.length === 0) return;

  const linkedTitleIds = [...new Set(links.map((l) => l.title_id))];
  const existingLinks = new Set<string>();

  const { data: existing, error: existingError } = await admin
    .from("title_tags")
    .select("title_id, tag_id")
    .is("owner_id", null)
    .in("title_id", linkedTitleIds);
  if (existingError) throw new Error(`Genre link lookup failed: ${existingError.message}`);
  for (const row of existing ?? []) existingLinks.add(`${row.title_id}:${row.tag_id}`);

  const newLinks = links.filter((l) => !existingLinks.has(`${l.title_id}:${l.tag_id}`));
  if (newLinks.length === 0) return;

  const linksByTitle = new Map<number, typeof newLinks>();
  for (const link of newLinks) {
    const existingForTitle = linksByTitle.get(link.title_id);
    if (existingForTitle) existingForTitle.push(link);
    else linksByTitle.set(link.title_id, [link]);
  }

  for (const rows of linksByTitle.values()) {
    const { error } = await admin.from("title_tags").insert(rows);
    if (error && error.code !== "23505") {
      throw new Error(`Genre link failed: ${error.message}`);
    }
  }
}

async function main(admin: SupabaseAdmin, malClientId: string, malClientSecret: string) {
  const { userId, tokens: initialTokens } = await getAnyConnectedAccount(admin);
  let tokens = initialTokens;

  let page = 0;
  let totalTitles = 0;
  let totalTagged = 0;

  for (;;) {
    const { data: rows, error } = await admin
      .from("media_titles")
      .select("id, mal_media_id")
      .eq("media_type", "manga")
      .order("id", { ascending: true })
      .range(page * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE + CATALOG_PAGE_SIZE - 1);

    if (error) throw new Error(`Catalog read failed: ${error.message}`);
    if (!rows || rows.length === 0) break;

    const idMap = new Map(rows.map((r) => [r.mal_media_id, r.id]));
    const nodes: MangaNode[] = [];

    for (const row of rows) {
      try {
        const result = await fetchGenres(
          admin,
          malClientId,
          malClientSecret,
          userId,
          tokens,
          row.mal_media_id,
        );
        tokens = result.tokens;
        nodes.push(result.node);
      } catch (err) {
        console.error(
          `- mal_media_id ${row.mal_media_id}: ${err instanceof Error ? err.message : err}`,
        );
        // A single title's fetch failure (a since-deleted MAL entry, a
        // transient 5xx) should not take the whole backfill down — the next
        // run picks it up again since nothing here marks it done.
      }
      await sleep(REQUEST_DELAY_MS);
    }

    await syncGenresBatch(admin, nodes, idMap);

    totalTitles += rows.length;
    totalTagged += nodes.filter((n) => (n.genres?.length ?? 0) > 0).length;
    console.log(`Page ${page + 1}: ${rows.length} titles fetched, ${nodes.length} succeeded.`);

    if (rows.length < CATALOG_PAGE_SIZE) break;
    page++;
  }

  console.log(
    `Done. ${totalTitles} catalog rows walked, ${totalTagged} carried at least one genre.`,
  );
}

/**
 * Reads env, builds the real Supabase client, and runs main(). Split out from
 * main() itself so that ALL of the script's side effects — not just the
 * network calls in main() — are gated behind the direct-run guard below.
 * Nothing above this point runs on import.
 */
function run(): Promise<void> {
  config({ path: ".env.local" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing from .env.local");

  const admin: SupabaseAdmin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const malClientId = process.env.MAL_CLIENT_ID;
  const malClientSecret = process.env.MAL_CLIENT_SECRET;
  if (!malClientId || !malClientSecret) {
    throw new Error("MAL_CLIENT_ID / MAL_CLIENT_SECRET missing from .env.local");
  }

  return main(admin, malClientId, malClientSecret);
}

// Direct-run guard: `import.meta.main` (stable in Node 24+, verified under
// this repo's `--experimental-strip-types` runner — see
// tests/backfill-genres.test.ts's header comment) is true only when this file
// is the process's entry point, false when another module imports it. The
// more common `require.main === module` idiom does not exist in ESM, and
// there is no CommonJS `module` here to compare against.
if (import.meta.main) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
