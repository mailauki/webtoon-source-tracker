/**
 * Shapes and ordering for tags.
 *
 * Kept out of `tags.ts` because that module is `server-only`: the tag chips
 * and the admin editors are client-side, and the tests need this logic
 * directly. Types are erased at build time, but the test runner still follows
 * the import at runtime — the same reason `collection-items.ts` sits beside
 * `collections.ts`.
 */

export type TagKind =
  | "genre"
  | "explicit"
  | "theme"
  | "demographic"
  | "trope"
  | "format";

/** Display order of the kinds. Genres first: they are the coarsest grouping. */
export const TAG_KINDS: TagKind[] = [
  "genre",
  "theme",
  "demographic",
  "trope",
  "format",
  // Last, and only ever shown to a viewer who may see adult titles at all.
  // Its own kind rather than a flag on `genre` because that is how MyAnimeList
  // itself splits them — "Manga Explicit Genres" is a separate group in their
  // taxonomy — and because a kind is what every grouping surface here already
  // keys on, so one column value gates the heading, its pills and its pages.
  "explicit",
];

/** The kinds whose tags describe adult content. */
export const EXPLICIT_KINDS: ReadonlySet<TagKind> = new Set<TagKind>([
  "explicit",
]);

/** Is this tag one a viewer must be a confirmed adult to browse? */
export function isExplicitKind(kind: string): boolean {
  return EXPLICIT_KINDS.has(kind as TagKind);
}

/**
 * Plural headings for the kinds, for a surface that groups tags under them.
 *
 * The kind itself is a singular lowercase slug — it is a column value, not a
 * label — so anything that shows a heading would otherwise capitalise and
 * pluralise it inline, and /discover and the admin list would be one edit
 * away from disagreeing about what a `format` is called.
 */
export const KIND_LABELS: Record<TagKind, string> = {
  genre: "Genres",
  theme: "Themes",
  demographic: "Demographics",
  trope: "Tropes",
  format: "Formats",
  explicit: "Explicit",
};

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

/** One kind's tags, as a surface that groups them renders them. */
export type TagGroup = { kind: TagKind; tags: Tag[] };

/**
 * Tags bucketed by kind, in TAG_KINDS order, each bucket sorted.
 *
 * Empty kinds are dropped: a heading with nothing under it is worse than no
 * heading.
 */
export function groupByKind(tags: Tag[]): TagGroup[] {
  return TAG_KINDS.map((kind) => ({
    kind,
    tags: sortTags(tags.filter((t) => t.kind === kind)),
  })).filter((group) => group.tags.length > 0);
}

