/**
 * Seeds the demo account with a realistic library.
 *
 * Run: npx tsx scripts/seed-demo.ts [--reset]
 *
 * Scoped entirely to the user identified by TEST_USER_EMAIL. It writes:
 *   media_titles  — shared catalog rows (upserted; harmless if they exist)
 *   user_entries  — that user's progress
 *   entry_sources — that user's source assignments, the point of the app
 *
 * It never touches another user's rows.
 *
 * It also writes a placeholder `mal_connections` row, because /library renders
 * the "Connect MyAnimeList" CTA whenever that row is missing — without it the
 * seeded titles never appear. The row is inert:
 *   - `mal_user_id` is a sentinel far outside MAL's real id range, so it can
 *     never collide with a genuine account (the column is globally unique).
 *   - No tokens are stored, so MalClient throws MalAuthError before any
 *     request — meaning sync can never reach its removal step and delete the
 *     hand-seeded entry_sources.
 *   - `last_synced_at` is set to now, so isStale() is false and the library
 *     does not kick off a background sync on first view.
 *
 * `--reset` clears this user's entries first. Without it, re-running only
 * upserts, so it is safe to run repeatedly.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const email = process.env.TEST_USER_EMAIL;

if (!url || !key) throw new Error("Supabase env vars missing from .env.local");
if (!email) throw new Error("TEST_USER_EMAIL missing from .env.local");

/**
 * Sentinel MAL user id for the demo connection.
 *
 * Well above MAL's real id space, so the globally-unique constraint on
 * mal_connections.mal_user_id can never collide with a genuine account.
 */
const DEMO_MAL_USER_ID = 999_000_001;

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Cover URLs are MAL's own CDN paths, matching what a real sync would store. */
type SeedTitle = {
  mal_media_id: number;
  title: string;
  title_en: string | null;
  main_picture_url: string;
  mal_media_kind: string;
  num_chapters: number | null;
  num_volumes: number | null;
  mal_status: string;
  list_status: "reading" | "completed" | "on_hold" | "dropped" | "plan_to_read";
  num_chapters_read: number;
  num_volumes_read: number;
  score: number;
  /** Where this title is read. The first entry is the primary source. */
  sources: {
    slug: string;
    url?: string;
    chapters_read?: number;
    is_official?: boolean;
    is_paid?: boolean;
    notes?: string;
  }[];
};

const TITLES: SeedTitle[] = [
  {
    mal_media_id: 121496,
    title: "Solo Leveling",
    title_en: "Solo Leveling",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/3/222295l.jpg",
    mal_media_kind: "manhwa",
    num_chapters: 201,
    num_volumes: 15,
    mal_status: "finished",
    list_status: "completed",
    num_chapters_read: 201,
    num_volumes_read: 15,
    score: 9,
    sources: [
      {
        slug: "tappytoon",
        url: "https://www.tappytoon.com/en/comics/solo-leveling",
        chapters_read: 201,
        is_paid: true,
        notes: "Official English release. Switched here once it caught up.",
      },
      { slug: "physical", chapters_read: 40, notes: "Volumes 1-3 in print." },
    ],
  },
  {
    mal_media_id: 132214,
    title: "Omniscient Reader's Viewpoint",
    title_en: "Omniscient Reader's Viewpoint",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/2/238873l.jpg",
    mal_media_kind: "manhwa",
    num_chapters: null,
    num_volumes: null,
    mal_status: "currently_publishing",
    list_status: "reading",
    num_chapters_read: 142,
    num_volumes_read: 0,
    score: 10,
    sources: [
      {
        slug: "webtoon",
        url: "https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154",
        chapters_read: 142,
        notes: "Free episodes run about three weeks behind fast pass.",
      },
    ],
  },
  {
    mal_media_id: 122663,
    title: "Tower of God",
    title_en: "Tower of God",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/2/223694l.jpg",
    mal_media_kind: "manhwa",
    num_chapters: null,
    num_volumes: null,
    mal_status: "currently_publishing",
    list_status: "reading",
    num_chapters_read: 620,
    num_volumes_read: 0,
    score: 8,
    sources: [
      {
        slug: "webtoon",
        url: "https://www.webtoons.com/en/fantasy/tower-of-god/list?title_no=95",
        chapters_read: 620,
      },
    ],
  },
  {
    mal_media_id: 13,
    title: "One Piece",
    title_en: "One Piece",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/2/253146l.jpg",
    mal_media_kind: "manga",
    num_chapters: null,
    num_volumes: null,
    mal_status: "currently_publishing",
    list_status: "reading",
    num_chapters_read: 1104,
    num_volumes_read: 0,
    score: 10,
    sources: [
      {
        slug: "mangaplus",
        url: "https://mangaplus.shueisha.co.jp/titles/100020",
        chapters_read: 1104,
        notes: "Latest three chapters free every Sunday.",
      },
      { slug: "viz", chapters_read: 1090, is_paid: true },
      { slug: "physical", chapters_read: 800, notes: "Box set 1-3." },
    ],
  },
  {
    mal_media_id: 116778,
    title: "Chainsaw Man",
    title_en: "Chainsaw Man",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/3/216464l.jpg",
    mal_media_kind: "manga",
    num_chapters: 232,
    num_volumes: 24,
    mal_status: "finished",
    list_status: "reading",
    num_chapters_read: 158,
    num_volumes_read: 11,
    score: 9,
    sources: [
      {
        slug: "mangaplus",
        url: "https://mangaplus.shueisha.co.jp/titles/100037",
        chapters_read: 158,
      },
    ],
  },
  {
    mal_media_id: 111996,
    title: "The God of High School",
    title_en: "The God of High School",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/1/205814l.webp",
    mal_media_kind: "manhwa",
    num_chapters: 569,
    num_volumes: null,
    mal_status: "finished",
    list_status: "on_hold",
    num_chapters_read: 88,
    num_volumes_read: 0,
    score: 7,
    sources: [
      {
        slug: "webtoon",
        url: "https://www.webtoons.com/en/action/the-god-of-high-school/list?title_no=66",
        chapters_read: 88,
        notes: "Paused mid-tournament arc; meaning to pick it back up.",
      },
    ],
  },
  {
    mal_media_id: 29983,
    title: "Noblesse",
    title_en: "Noblesse",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/2/266261l.webp",
    mal_media_kind: "manhwa",
    num_chapters: 544,
    num_volumes: null,
    mal_status: "finished",
    list_status: "reading",
    num_chapters_read: 176,
    num_volumes_read: 0,
    score: 8,
    sources: [
      {
        slug: "tapas",
        url: "https://tapas.io/series/Noblesse/info",
        chapters_read: 176,
        notes: "Moved here after the original Webtoon run ended.",
      },
      {
        slug: "webtoon",
        chapters_read: 120,
        notes: "Where I started before the move.",
      },
    ],
  },
  {
    mal_media_id: 113138,
    title: "Jujutsu Kaisen",
    title_en: "Jujutsu Kaisen",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/3/210341l.webp",
    mal_media_kind: "manga",
    num_chapters: 272,
    num_volumes: 30,
    mal_status: "finished",
    list_status: "completed",
    num_chapters_read: 272,
    num_volumes_read: 30,
    score: 9,
    sources: [
      {
        slug: "mangaplus",
        url: "https://mangaplus.shueisha.co.jp/titles/100034",
        chapters_read: 272,
      },
      { slug: "viz", chapters_read: 272, is_paid: true },
    ],
  },
  {
    mal_media_id: 147863,
    title: "Nano Machine",
    title_en: "Nano Machine",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/1/312579l.webp",
    mal_media_kind: "manhwa",
    num_chapters: null,
    num_volumes: null,
    mal_status: "currently_publishing",
    list_status: "plan_to_read",
    num_chapters_read: 0,
    num_volumes_read: 0,
    score: 0,
    sources: [],
  },
  {
    mal_media_id: 124845,
    title: "Sweet Home",
    title_en: "Sweet Home",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/3/227600l.webp",
    mal_media_kind: "manhwa",
    num_chapters: 141,
    num_volumes: 12,
    mal_status: "finished",
    list_status: "dropped",
    num_chapters_read: 31,
    num_volumes_read: 0,
    score: 5,
    sources: [
      {
        slug: "webtoon",
        url: "https://www.webtoons.com/en/thriller/sweet-home/list?title_no=1285",
        chapters_read: 31,
      },
    ],
  },
  {
    mal_media_id: 127907,
    title: "Kaijuu 8-gou",
    title_en: "Kaiju No. 8",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/3/252929l.webp",
    mal_media_kind: "manga",
    num_chapters: 129,
    num_volumes: null,
    mal_status: "finished",
    list_status: "reading",
    num_chapters_read: 112,
    num_volumes_read: 0,
    score: 8,
    sources: [
      {
        slug: "mangaplus",
        url: "https://mangaplus.shueisha.co.jp/titles/100080",
        chapters_read: 112,
      },
    ],
  },
  {
    mal_media_id: 23390,
    title: "Shingeki no Kyojin",
    title_en: "Attack on Titan",
    main_picture_url: "https://cdn.myanimelist.net/images/manga/2/37846l.webp",
    mal_media_kind: "manga",
    num_chapters: 141,
    num_volumes: 34,
    mal_status: "finished",
    list_status: "completed",
    num_chapters_read: 141,
    num_volumes_read: 34,
    score: 9,
    sources: [
      { slug: "physical", chapters_read: 141, notes: "Complete set." },
      { slug: "kmanga", chapters_read: 141, is_paid: true },
    ],
  },
];

async function main() {
  const reset = process.argv.includes("--reset");

  // --- Resolve the demo user -------------------------------------------
  // listUsers is paginated; the demo project is small enough that one page
  // covers it, but page through anyway rather than silently missing the user.
  let userId: string | undefined;
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    userId = data.users.find((u) => u.email === email)?.id;
    if (data.users.length < 200) break;
  }
  if (!userId) throw new Error(`No auth user found for TEST_USER_EMAIL`);
  console.log(`Demo user resolved: ${userId}`);

  // --- Source slug -> id ------------------------------------------------
  const { data: sourceRows, error: sourceErr } = await admin
    .from("sources")
    .select("id, slug")
    .is("owner_id", null);
  if (sourceErr) throw new Error(`Source lookup failed: ${sourceErr.message}`);
  const sourceId = new Map(sourceRows!.map((s) => [s.slug, s.id]));

  if (reset) {
    // entry_sources cascades from user_entries, so one delete is enough.
    const { error } = await admin.from("user_entries").delete().eq("user_id", userId);
    if (error) throw new Error(`Reset failed: ${error.message}`);
    console.log("Cleared existing entries for the demo user.");
  }

  // --- Catalog ----------------------------------------------------------
  const now = new Date().toISOString();
  const { error: titleErr } = await admin.from("media_titles").upsert(
    TITLES.map((t) => ({
      media_type: "manga" as const,
      mal_media_id: t.mal_media_id,
      title: t.title,
      title_en: t.title_en,
      main_picture_url: t.main_picture_url,
      mal_media_kind: t.mal_media_kind,
      num_chapters: t.num_chapters,
      num_volumes: t.num_volumes,
      mal_status: t.mal_status,
      synced_at: now,
    })),
    { onConflict: "media_type,mal_media_id" },
  );
  if (titleErr) throw new Error(`Catalog upsert failed: ${titleErr.message}`);

  const { data: catalog, error: catalogErr } = await admin
    .from("media_titles")
    .select("id, mal_media_id")
    .eq("media_type", "manga")
    .in("mal_media_id", TITLES.map((t) => t.mal_media_id));
  if (catalogErr) throw new Error(`Catalog lookup failed: ${catalogErr.message}`);
  const titleId = new Map(catalog!.map((r) => [r.mal_media_id, r.id]));

  // --- Entries ----------------------------------------------------------
  // Staggered mal_updated_at so "recently updated" sorting has something to
  // order by, rather than twelve rows sharing one timestamp.
  const { data: entries, error: entryErr } = await admin
    .from("user_entries")
    .upsert(
      TITLES.map((t, i) => ({
        user_id: userId,
        title_id: titleId.get(t.mal_media_id)!,
        list_status: t.list_status,
        num_chapters_read: t.num_chapters_read,
        num_volumes_read: t.num_volumes_read,
        score: t.score,
        is_rereading: false,
        mal_updated_at: new Date(Date.now() - i * 36e5 * 19).toISOString(),
        synced_at: now,
      })),
      { onConflict: "user_id,title_id" },
    )
    .select("id, title_id");
  if (entryErr) throw new Error(`Entry upsert failed: ${entryErr.message}`);
  const entryId = new Map(entries!.map((e) => [e.title_id, e.id]));

  // --- Source assignments ----------------------------------------------
  const assignments = TITLES.flatMap((t) =>
    t.sources.map((s, i) => {
      const id = sourceId.get(s.slug);
      if (!id) throw new Error(`Unknown source slug: ${s.slug}`);
      return {
        user_id: userId!,
        entry_id: entryId.get(titleId.get(t.mal_media_id)!)!,
        source_id: id,
        url: s.url ?? null,
        chapters_read: s.chapters_read ?? null,
        // A partial unique index allows only one primary per entry; the first
        // listed source is it.
        is_primary: i === 0,
        is_official: s.is_official ?? true,
        is_paid: s.is_paid ?? false,
        notes: s.notes ?? null,
      };
    }),
  );

  const { error: assignErr } = await admin
    .from("entry_sources")
    .upsert(assignments, { onConflict: "entry_id,source_id" });
  if (assignErr) throw new Error(`Source assignment failed: ${assignErr.message}`);

  // --- Demo MAL connection ---------------------------------------------
  // See the note at the top of this file: this exists only so /library shows
  // the grid instead of the connect CTA. It carries no tokens.
  const { error: connErr } = await admin.from("mal_connections").upsert(
    {
      user_id: userId,
      mal_user_id: DEMO_MAL_USER_ID,
      mal_username: "demo_reader",
      status: "active",
      last_synced_at: now,
    },
    { onConflict: "user_id" },
  );
  if (connErr) throw new Error(`Connection upsert failed: ${connErr.message}`);

  console.log(
    `Seeded ${TITLES.length} titles and ${assignments.length} source assignments.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
