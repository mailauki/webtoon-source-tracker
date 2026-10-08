import "server-only";

import { z } from "zod";

/**
 * A MyAnimeList person's manga, through Jikan (api.jikan.moe).
 *
 * MyAnimeList's own v2 API has no people endpoints, so it cannot list what an
 * author made. Jikan is a free, unauthenticated API over MyAnimeList's public
 * pages, and the only way to that list. It allows about three requests a
 * second, so answers are cached for a day: an author's bibliography changes
 * far more slowly than that, and the entry page asks for it on every visit.
 */

const personMangaSchema = z.object({
  data: z.array(
    z.object({
      position: z.string().nullish(),
      manga: z.object({
        mal_id: z.number(),
        title: z.string(),
        images: z
          .object({
            jpg: z
              .object({
                large_image_url: z.string().nullish(),
                image_url: z.string().nullish(),
              })
              .nullish(),
          })
          .nullish(),
      }),
    }),
  ),
});

export type MalPersonWork = { malId: number; title: string; cover: string | null };

/** Every manga a MyAnimeList person is credited on. Empty when Jikan fails. */
export async function getPersonManga(personId: number): Promise<MalPersonWork[]> {
  try {
    const response = await fetch(`https://api.jikan.moe/v4/people/${personId}/manga`, {
      next: { revalidate: 86_400 },
    });
    if (!response.ok) throw new Error(`Jikan answered ${response.status}`);

    const { data } = personMangaSchema.parse(await response.json());
    return data.map(({ manga }) => ({
      malId: manga.mal_id,
      title: manga.title,
      cover: manga.images?.jpg?.large_image_url ?? manga.images?.jpg?.image_url ?? null,
    }));
  } catch (cause) {
    console.error(`[jikan] people/${personId}/manga failed:`, cause);
    return [];
  }
}
