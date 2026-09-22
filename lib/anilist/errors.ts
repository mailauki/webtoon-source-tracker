/**
 * The connection needs re-authorization: the token expired or was revoked.
 *
 * AniList has no refresh grant — a token lasts a year and then the user has to
 * connect again — so unlike MalAuthError this never follows a failed refresh.
 */
export class AniListAuthError extends Error {
  constructor(message = "AniList authorization expired") {
    super(message);
    this.name = "AniListAuthError";
  }
}

/** Over quota. AniList signals this with a real 429 and a Retry-After. */
export class AniListRateLimitError extends Error {
  constructor(message = "AniList rate limit reached") {
    super(message);
    this.name = "AniListRateLimitError";
  }
}

/** Any other failure reported by the AniList API, HTTP or GraphQL. */
export class AniListApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AniListApiError";
  }
}
