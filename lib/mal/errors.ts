/** The connection needs re-authorization: refresh failed or access revoked. */
export class MalAuthError extends Error {
  constructor(message = "MyAnimeList authorization expired") {
    super(message);
    this.name = "MalAuthError";
  }
}

/**
 * Over quota.
 *
 * Note MAL signals this with 403, not 429 — naive retry logic that only
 * special-cases 429 will hammer the API instead of backing off.
 */
export class MalRateLimitError extends Error {
  constructor(message = "MyAnimeList rate limit reached") {
    super(message);
    this.name = "MalRateLimitError";
  }
}

/** Any other non-2xx from the MAL API. */
export class MalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MalApiError";
  }
}
