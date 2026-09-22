import type { TagKind } from "@/lib/data/tag-items";

/**
 * An emoji for a tag, for the category pills on /discover.
 *
 * A lookup table rather than a column. `tags` is written from two directions —
 * an admin creating one by hand, and `syncGenres` inserting whatever MAL's
 * genre list contains — and only the first of those could ever supply an
 * emoji, so a column would be null for most rows the moment MAL added a genre.
 * Deriving it from the slug means a tag that arrives from MAL already has its
 * glyph, and a tag nobody thought to list still gets the one for its kind.
 *
 * Keyed on `slug`, not `name`: the slug is unique in the database and stable
 * under a rename, so renaming "Sci-Fi" to "Science Fiction" keeps the rocket.
 * The trade is that a tag created with an unexpected slug falls back silently
 * — which is the right failure, since the glyph is decoration and the label
 * beside it already says what the tag is.
 */

/** The fallback per kind. Deliberately generic: it is the "no entry" case. */
const BY_KIND: Record<TagKind, string> = {
  genre: "📚",
  theme: "🎭",
  demographic: "👥",
  trope: "💫",
  format: "📐",
  explicit: "🔞",
};

/**
 * Slugs worth a glyph of their own.
 *
 * Covers MAL's genre, theme and demographic lists (the vocabulary
 * `syncGenres` imports) plus the webtoon tropes this app's own tags tend to
 * use. Listing a slug that no tag carries costs nothing, so entries here run
 * ahead of the catalog rather than behind it.
 */
const BY_SLUG: Record<string, string> = {
  // MAL genres
  action: "⚔️",
  adventure: "🧭",
  "avant-garde": "🎨",
  "award-winning": "🏆",
  "boys-love": "💙",
  comedy: "😂",
  drama: "🎭",
  ecchi: "💋",
  erotica: "🔞",
  fantasy: "🦄",
  "girls-love": "💛",
  gourmet: "🍜",
  hentai: "🔞",
  horror: "👻",
  mystery: "🕵️",
  romance: "💗",
  "sci-fi": "🚀",
  "slice-of-life": "🍵",
  sports: "⚽",
  supernatural: "🔮",
  suspense: "😱",

  // MAL themes
  "adult-cast": "🧑",
  anthropomorphic: "🐾",
  cgdct: "🌸",
  childcare: "🍼",
  "combat-sports": "🥊",
  crossdressing: "👗",
  delinquents: "🧃",
  detective: "🔎",
  educational: "🎓",
  "high-stakes-game": "🎲",
  historical: "🏛️",
  "idols-female": "🎤",
  "idols-male": "🎸",
  isekai: "🌀",
  iyashikei: "🌿",
  "love-polygon": "💞",
  "magical-sex-shift": "✨",
  "martial-arts": "🥋",
  mecha: "🤖",
  medical: "🩺",
  military: "🎖️",
  music: "🎵",
  mythology: "🏺",
  "organized-crime": "🕴️",
  "otaku-culture": "🗾",
  parody: "🃏",
  "performing-arts": "🎼",
  pets: "🐶",
  psychological: "🧠",
  "racing": "🏎️",
  "reincarnation": "♻️",
  "reverse-harem": "🌹",
  harem: "💐",
  samurai: "🗡️",
  school: "🏫",
  showbiz: "🎬",
  space: "🪐",
  "strategy-game": "♟️",
  "super-power": "💥",
  survival: "🏕️",
  "team-sports": "🏀",
  "time-travel": "⏳",
  vampire: "🧛",
  "video-game": "🎮",
  "visual-arts": "🖌️",
  workplace: "💼",

  // MAL demographics
  josei: "🌷",
  kids: "🧸",
  seinen: "🧔",
  shoujo: "🎀",
  shounen: "🔥",

  // Webtoon tropes this app tags by hand
  apocalypse: "☄️",
  "arranged-marriage": "💍",
  cooking: "🍳",
  crime: "🚔",
  cultivation: "🐉",
  dungeon: "🕳️",
  "enemies-to-lovers": "⚡",
  "found-family": "🏡",
  "office-romance": "☕",
  regression: "⏪",
  revenge: "😈",
  "second-chance": "🔁",
  system: "📟",
  tower: "🗼",
  transmigration: "🚪",
  villainess: "👑",
  zombie: "🧟",

  // Formats
  doujinshi: "✏️",
  "light-novel": "📖",
  manga: "📗",
  manhua: "🏮",
  manhwa: "🌏",
  novel: "📕",
  "one-shot": "📄",
  oneshot: "📄",
  webtoon: "📱",
};

/** The glyph for one tag: its own, or the fallback for its kind. */
export function tagEmoji(tag: { slug: string; kind: TagKind }): string {
  return BY_SLUG[tag.slug] ?? BY_KIND[tag.kind];
}
