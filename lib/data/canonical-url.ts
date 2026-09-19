/**
 * Canonicalising the URLs a read button opens.
 *
 * The app is installable (`display: "standalone"` in app/manifest.ts), and on
 * iOS a home-screen web app hands every external link to the system in-app
 * browser. That sheet is presented *before* iOS decides whether the URL is a
 * universal link the native app should claim, so a link that resolves cleanly
 * shows the sheet for an instant; a link that needs a redirect first shows it
 * blank for as long as the hop takes, and frequently never hands off at all —
 * universal links are matched against the URL actually requested, not against
 * wherever a 301 eventually lands.
 *
 * So the redirect hop is the thing worth removing, and a pasted link is full
 * of them: `http://` upgrading to https, a bare or `m.` host redirecting to
 * the canonical one, a share sheet's `?utm_…` tail. None of that changes where
 * the link goes; all of it costs a round trip in front of the handoff.
 *
 * TODO(deep-links): this narrows the window, it does not close it. The sheet is
 * presented before iOS decides whether to hand off at all, so a clean handoff
 * still flashes it. See TODO.md for what would actually remove it, why that is
 * probably not worth building, and the diagnostic that has not been run yet.
 *
 * Kept in `lib/data` rather than beside the form for the reason
 * `source-links.ts` gives: the form module imports the server actions it
 * submits, and the actions, the backfill script and the tests all need this
 * without that graph. Pure and dependency-free — scripts/canonicalize-urls.ts
 * imports it under plain `node --experimental-strip-types`, which resolves
 * neither `server-only` nor tsconfig's "@/*" alias.
 */

/**
 * The canonical host for each source in the seeded catalog, as
 * supabase/migrations/20260820065119_seed_sources.sql spells it.
 *
 * These are the hosts worth rewriting because they are the ones with native
 * apps behind them — an arbitrary scanlation site has no universal link to
 * race, so there is nothing to win by touching its host. Keep in step with the
 * seed: a source whose `base_url` changes wants its entry changed here too.
 */
const CANONICAL_HOSTS = [
  "www.webtoons.com",
  "tapas.io",
  "mangaplus.shueisha.co.jp",
  "mangadex.org",
  "www.tappytoon.com",
  "www.lezhinus.com",
  "manta.net",
  "page.kakao.com",
  "www.viz.com",
  "kmanga.kodansha.com",
  "comics.inkr.com",
] as const;

/**
 * Every spelling of a known host, mapped to the canonical one.
 *
 * The three that actually show up in pasted links: the bare domain, the `www.`
 * form, and the `m.` mobile form a phone gets handed when a site sniffs the
 * user agent. `m.webtoons.com` is the common one — it is what the mobile site
 * links to internally, and it redirects to `www.` on the way to the app.
 */
const HOST_ALIASES = new Map<string, string>(
  CANONICAL_HOSTS.flatMap((canonical) => {
    const bare = canonical.replace(/^www\./, "");
    return [canonical, bare, `www.${bare}`, `m.${bare}`].map(
      (alias): [string, string] => [alias, canonical],
    );
  }),
);

/**
 * Query parameters that identify where a link was shared from, not what it
 * points at.
 *
 * Dropping them is not privacy theatre here — it is that a share-sheet URL
 * carries a tail long enough to hide the part of the link that matters when it
 * is shown back in the source editor, and some sites bounce through a
 * redirector when they see one.
 */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_branch_match_id",
  "_branch_referrer",
]);

/** Everything Google Analytics and friends prefix rather than name. */
const TRACKING_PREFIXES = ["utm_"];

function isTracking(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    TRACKING_PARAMS.has(lower) ||
    TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

/**
 * The URL to store for an attached source.
 *
 * Returns "" for blank input, so callers can keep spelling "no link" as
 * `url || null`. Anything it cannot parse, and anything that is not http(s),
 * comes back trimmed but otherwise untouched: the server actions validate with
 * zod before calling this, and the backfill script runs over rows that predate
 * that validation, so neither wants this to be the thing that rejects a value.
 *
 * Deliberately conservative about the scheme. An `http:` link is upgraded only
 * for a host in the table above, where https is known to be served and the
 * upgrade removes a redirect. Forcing it on an unknown host would be this
 * function breaking a link that worked, to save a hop no app is waiting on.
 */
export function canonicalUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return trimmed;

  // `URL` lowercases the host already; the trailing dot of a fully-qualified
  // name survives it, and `www.webtoons.com.` misses the table without this.
  const host = url.hostname.replace(/\.$/, "");
  const canonical = HOST_ALIASES.get(host);

  // An explicit non-default port disqualifies the rewrite. `URL` has already
  // dropped :80 and :443, so whatever is left is someone pointing at a
  // specific service — a proxy, a local mirror — and neither the canonical
  // host nor https is a safe assumption about what answers there. The
  // tracking strip below still applies.
  if (canonical && !url.port) {
    url.hostname = canonical;
    url.protocol = "https:";
  }

  for (const key of [...url.searchParams.keys()]) {
    if (isTracking(key)) url.searchParams.delete(key);
  }
  // Otherwise a URL whose only parameters were tracking ones keeps a bare "?".
  if (!url.searchParams.size) url.search = "";

  return url.toString();
}
