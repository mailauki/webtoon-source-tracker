import "server-only";

/**
 * Reading past PostgREST's row cap.
 *
 * Supabase caps every collection response at the project's `max_rows`, which
 * is 1000 both in `supabase/config.toml` and by default on the cloud project.
 * The cap is silent: the response is a 200 with a thousand rows on it, and the
 * only sign that more existed is a `Content-Range` header nobody reads. A list
 * that outgrows it does not fail, it just quietly stops having a tail — and
 * since the library is ordered by `mal_updated_at desc`, the rows that vanish
 * are the ones the user has not touched in longest, which are also the ones
 * they are least likely to notice missing.
 *
 * That mattered because the sync is built for far more than the reads could
 * show: lib/sync/sync-list.ts pages MyAnimeList up to MAX_PAGES × PAGE_SIZE,
 * so the app will happily store 5,000 titles it could only ever render 1,000
 * of. This closes that gap from the read side.
 *
 * Paging rather than raising `max_rows`: the cap also lives in the cloud
 * project's dashboard, which `config.toml` does not push, so a project that
 * was never clicked through would keep truncating with nothing in the repo to
 * show why.
 */

/**
 * Rows to ask for per request.
 *
 * Matched to `max_rows` so a library that fits under the cap — which is nearly
 * all of them — still costs exactly one query. It is an upper bound on the
 * request, not an assumption about the answer: a project configured with a
 * smaller cap simply returns shorter pages and the loop takes more of them,
 * because it advances by what came back rather than by what it asked for.
 */
const PAGE_SIZE = 1000;

/**
 * The most rows any one read will return.
 *
 * Deliberately the same ceiling the sync already enforces (MAX_PAGES ×
 * PAGE_SIZE in lib/sync/sync-list.ts): a read that returned more than the sync
 * can write would be describing a library this app cannot produce. It is also
 * what stops a pathological `max_rows` from turning one page load into an
 * unbounded run of queries.
 */
const MAX_ROWS = 5000;

type PageResult<T> = {
  data: T[] | null;
  /** PostgREST's exact total, which `max_rows` does not truncate. */
  count: number | null;
  error: { message: string } | null;
};

/**
 * Run a range-paged read to completion.
 *
 * `page` is handed the inclusive `from`/`to` of the next window and must
 * return a query built with `{ count: "exact" }` — that count is the whole
 * mechanism. It reports the true size of the result set regardless of the row
 * cap, so the loop knows on the first response whether there is a second page
 * to ask for, and a list that fits never pays for a probe request that comes
 * back empty.
 *
 * Without the count the only way to tell "that is everything" from "that is
 * all you are allowed" would be to compare the batch against the size asked
 * for — which reads a smaller `max_rows` as the end of the data and truncates
 * exactly as before, silently.
 */
export async function readAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];

  while (rows.length < MAX_ROWS) {
    const from = rows.length;
    const requested = Math.min(PAGE_SIZE, MAX_ROWS - from);
    const { data, count, error } = await page(from, from + requested - 1);

    if (error) throw new Error(`Failed to load ${label}: ${error.message}`);

    const batch = data ?? [];
    rows.push(...batch);

    // The end of the data — and the one thing standing between a server that
    // refuses to advance and a loop that never ends.
    if (batch.length === 0) break;

    if (count !== null) {
      if (rows.length >= count) break;
      continue;
    }

    // No count came back, so fall back to reading a short page as the end.
    // That is right whenever `max_rows` and PAGE_SIZE agree, which is the
    // only case a caller that skipped the count can be in.
    if (batch.length < requested) break;
  }

  return rows;
}
