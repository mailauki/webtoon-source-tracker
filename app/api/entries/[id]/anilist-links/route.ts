import { NextResponse } from "next/server";

import { getMediaExtras } from "@/lib/anilist/endpoints";
import { getOptionalSession } from "@/lib/auth/dal";
import { catalogLinks, suggestSourceLinks } from "@/lib/data/anilist-links";
import { getSources } from "@/lib/data/sources";
import { createClient } from "@/lib/supabase/server";

/**
 * AniList's reading links for one entry, shaped as the library card's
 * quick actions: sources AniList lists that the entry does not have yet, and
 * attached sources still missing a URL that AniList has one for.
 *
 * The same matching the entry page does (lib/data/anilist-links.ts), served
 * on demand so a card only asks AniList when its menu or sheet is opened —
 * a shelf of cards asking up front would be one AniList request per title.
 *
 * A Route Handler rather than a Server Action, for the reason the catalog
 * search gives: this is a read, and Next runs actions one at a time per
 * client, so a slow AniList answer would queue behind it every progress edit
 * made from the same page.
 *
 * Reply: `{ add: { sourceId, name, url }[], fill: LinkSuggestion[] }`. Empty
 * lists when AniList has nothing or cannot be reached — the menu then keeps
 * its own shortcuts, so an outage costs the links and nothing else.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/entries/[id]/anilist-links">,
) {
  // Reachable directly, so the check is load-bearing — and a 401 in JSON, not
  // a redirect, for the same reason the catalog search gives.
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const entryId = Number((await params).id);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return NextResponse.json({ error: "Unknown entry." }, { status: 404 });
  }

  // RLS scopes this to the caller: someone else's entry reads as missing.
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("user_entries")
    .select(
      `media_titles!inner ( mal_media_id, anilist_media_id ),
       entry_sources ( id, url, sources ( id, name, base_url ) )`,
    )
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) {
    return NextResponse.json({ error: "Unknown entry." }, { status: 404 });
  }

  const title = entry.media_titles as unknown as {
    mal_media_id: number | null;
    anilist_media_id: number | null;
  };
  const attached = (entry.entry_sources ?? []) as unknown as {
    id: number;
    url: string | null;
    sources: { id: number; name: string; base_url: string | null } | null;
  }[];

  const [media, catalog] = await Promise.all([
    getMediaExtras({
      anilistMediaId: title.anilist_media_id,
      malMediaId: title.mal_media_id,
    }),
    getSources(),
  ]);

  if (!media) return NextResponse.json({ add: [], fill: [] });

  const links = catalogLinks(media.externalLinks, catalog);
  const attachedIds = new Set(attached.map((row) => row.sources?.id));

  return NextResponse.json({
    add: catalog
      .filter((source) => links[source.id] && !attachedIds.has(source.id))
      .map((source) => ({
        sourceId: source.id,
        name: source.name,
        url: links[source.id],
      })),
    fill: suggestSourceLinks(media.externalLinks, attached),
  });
}
