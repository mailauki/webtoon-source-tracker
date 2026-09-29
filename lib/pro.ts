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
  poster: "Custom posters are part of Pro.",
  authors: "More from the author is part of Pro.",
} as const;

export type ProFeature = keyof typeof PRO_MESSAGES;

export function isProRequired(error: { code?: string } | null | undefined): boolean {
  return error?.code === PRO_REQUIRED_CODE;
}
