import { slugify, type TagKind } from "@/lib/data/tag-items";

/**
 * How MyAnimeList's own tag groups map onto this app's kinds.
 *
 * MAL sends a flat `genres` array on every node with nothing to say which of
 * its four groups an entry came from, so `syncGenres` used to write every one
 * as `kind: "genre"`. That put Isekai, Shounen and Erotica under one heading
 * — and, once adult content became something this app gates, left the
 * explicit ones indistinguishable from the rest.
 *
 * This is that missing half of the payload, transcribed from MAL's own
 * advanced-search filters: Manga Genres, Manga Explicit Genres, Manga Themes,
 * Manga Demographics.
 *
 * Keyed on the slug, not the name, for the same reason tag-emoji.ts is: the
 * slug is unique in the database and stable under a rename, so an admin
 * renaming "Sci-Fi" does not silently reclassify it.
 *
 * A name absent from every list falls back to `genre`, which is exactly what
 * the old behaviour was — so a group MAL adds tomorrow lands where it always
 * did rather than failing the sync. The one direction that must not degrade
 * quietly is the explicit list; see `isExplicitName`.
 */

/** "Manga Explicit Genres" — MAL's own separate group. */
const EXPLICIT = ["Ecchi", "Erotica", "Hentai"];

/** "Manga Demographics". */
const DEMOGRAPHIC = ["Josei", "Kids", "Seinen", "Shoujo", "Shounen"];

/** "Manga Themes". */
const THEME = [
  "Adult Cast", "Anthropomorphic", "CGDCT", "Childcare",
  "Combat Sports", "Crossdressing", "Delinquents", "Detective",
  "Educational", "Gag Humor", "Gore", "Harem",
  "High Stakes Game", "Historical", "Idols (Female)", "Idols (Male)",
  "Isekai", "Iyashikei", "Love Polygon", "Love Status Quo",
  "Magical Sex Shift", "Mahou Shoujo", "Martial Arts", "Mecha",
  "Medical", "Memoir", "Military", "Music",
  "Mythology", "Organized Crime", "Otaku Culture", "Parody",
  "Performing Arts", "Pets", "Psychological", "Racing",
  "Reincarnation", "Reverse Harem", "Samurai", "School",
  "Showbiz", "Space", "Strategy Game", "Super Power",
  "Survival", "Team Sports", "Time Travel", "Urban Fantasy",
  "Vampire", "Video Game", "Villainess", "Visual Arts",
  "Workplace",
];

function bySlug(names: string[], kind: TagKind): Map<string, TagKind> {
  return new Map(names.map((name) => [slugify(name), kind]));
}

const KIND_BY_SLUG: Map<string, TagKind> = new Map([
  ...bySlug(EXPLICIT, "explicit"),
  ...bySlug(DEMOGRAPHIC, "demographic"),
  ...bySlug(THEME, "theme"),
]);

/**
 * The kind a MAL tag name belongs to.
 *
 * Anything unlisted is a genre — MAL's largest group, and the old default.
 */
export function kindForMalGenre(name: string): TagKind {
  return KIND_BY_SLUG.get(slugify(name)) ?? "genre";
}

/**
 * Is this MAL tag name one of the explicit ones?
 *
 * Separate from `kindForMalGenre` because the two fail in opposite
 * directions. That one may default to `genre` for a name it does not know;
 * this one decides whether a tag is gated behind the age floor, so it is the
 * caller's cue to treat an unrecognised-but-adult name as adult rather than
 * trusting the fallback. Kept as its own export so the rule has one home.
 */
export function isExplicitName(name: string): boolean {
  return KIND_BY_SLUG.get(slugify(name)) === "explicit";
}
