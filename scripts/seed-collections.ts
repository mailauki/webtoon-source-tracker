/**
 * Seeds the curated collections shown on /discover.
 *
 * Run: yarn seed:collections
 *
 * Curated collections are editorial rows with a null `owner_id`. There is no
 * admin UI for them by design — they are content, written here and applied
 * with the service role, which is the only writer RLS allows (the insert
 * policy requires `owner_id = auth.uid()`, and null never equals a uuid).
 *
 * It writes only curated rows. No user's own collections are ever touched:
 * every statement below is scoped by `is("owner_id", null)`.
 *
 * A collection can only list titles that already exist in `media_titles`, and
 * every path into that table runs through somebody's MAL account — so run
 * `yarn seed:demo` first on a fresh database, or the lookups below will find
 * nothing and each collection will be skipped with a warning. Titles that are
 * missing are skipped individually rather than failing the run, so this stays
 * useful against a real database whose catalog covers only some of them.
 *
 * Re-running is safe: collections are upserted on their slug, and each one's
 * items are replaced wholesale so edits here show up rather than accumulating.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) throw new Error("Supabase env vars missing from .env.local");

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type SeedCollection = {
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  /** MAL manga ids, in the order they should appear on the shelf. */
  titles: { mal_media_id: number; note?: string }[];
};

/**
 * The shelves, in page order.
 *
 * These reference the same MAL ids `scripts/seed-demo.ts` writes, so a seeded
 * demo database has something to show on /discover immediately. Against a real
 * database they resolve to whichever of those titles the catalog happens to
 * hold.
 */
const COLLECTIONS: SeedCollection[] = [
  {
    slug: "manhwa-to-start-with",
    name: "Where to start with manhwa 🇰🇷",
    description: "The ones that got everybody else into it.",
    sort_order: 10,
    titles: [
      { mal_media_id: 121496, note: "The one everyone recommends first." },
      { mal_media_id: 122663, note: "Long, strange, and worth the climb." },
      { mal_media_id: 111996, note: "Fights that look like animation." },
      { mal_media_id: 132214, note: "For readers who like their plots dense." },
      { mal_media_id: 29983 },
    ],
  },
  {
    slug: "finished-and-complete",
    name: "No cliffhangers here ✅",
    description: "Completed series you can read start to finish tonight.",
    sort_order: 20,
    titles: [
      { mal_media_id: 116778, note: "Ends exactly where it should." },
      { mal_media_id: 23390 },
      { mal_media_id: 124845, note: "One story, told and closed." },
      { mal_media_id: 29983 },
    ],
  },
  {
    slug: "perfect-for-binging",
    name: "Perfect for binging 🎈",
    description: "Deep backlogs — settle in for the weekend.",
    sort_order: 30,
    titles: [
      { mal_media_id: 13, note: "A thousand chapters and still going." },
      { mal_media_id: 122663 },
      { mal_media_id: 147863 },
      { mal_media_id: 113138 },
      { mal_media_id: 127907 },
    ],
  },
];

async function main() {
  const wanted = [
    ...new Set(COLLECTIONS.flatMap((c) => c.titles.map((t) => t.mal_media_id))),
  ];

  const { data: catalog, error: catalogErr } = await admin
    .from("media_titles")
    .select("id, mal_media_id")
    .eq("media_type", "manga")
    .in("mal_media_id", wanted);
  if (catalogErr) throw new Error(`Catalog lookup failed: ${catalogErr.message}`);

  const titleId = new Map((catalog ?? []).map((r) => [r.mal_media_id, r.id]));

  const missing = wanted.filter((id) => !titleId.has(id));
  if (missing.length > 0) {
    console.warn(
      `Not in the catalog, so these are skipped: ${missing.join(", ")}.\n` +
        "Run `yarn seed:demo` first, or add them from the app.",
    );
  }

  for (const seed of COLLECTIONS) {
    const items = seed.titles.filter((t) => titleId.has(t.mal_media_id));

    if (items.length === 0) {
      console.warn(`- ${seed.slug}: no titles in the catalog, skipped.`);
      continue;
    }

    const { data: collection, error: collectionErr } = await admin
      .from("collections")
      .upsert(
        {
          owner_id: null,
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          sort_order: seed.sort_order,
          is_active: true,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (collectionErr) {
      throw new Error(`Collection ${seed.slug} failed: ${collectionErr.message}`);
    }

    // Replaced rather than upserted: an item removed from the array above
    // should leave the shelf, which an upsert alone would never do. Safe
    // because curated items carry no user data — they are content.
    const { error: clearErr } = await admin
      .from("collection_items")
      .delete()
      .eq("collection_id", collection.id);
    if (clearErr) {
      throw new Error(`Clearing ${seed.slug} failed: ${clearErr.message}`);
    }

    const { error: itemErr } = await admin.from("collection_items").insert(
      items.map((t, i) => ({
        collection_id: collection.id,
        title_id: titleId.get(t.mal_media_id)!,
        // Spaced so a title can be slipped between two others by hand without
        // renumbering the whole shelf.
        position: (i + 1) * 10,
        note: t.note ?? null,
      })),
    );
    if (itemErr) throw new Error(`Items for ${seed.slug} failed: ${itemErr.message}`);

    const skipped = seed.titles.length - items.length;
    console.log(
      `- ${seed.slug}: ${items.length} title${items.length === 1 ? "" : "s"}` +
        (skipped > 0 ? ` (${skipped} skipped)` : ""),
    );
  }

  console.log("Curated collections seeded.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
