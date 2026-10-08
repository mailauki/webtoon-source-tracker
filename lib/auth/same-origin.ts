/**
 * The Origin header's host against the host this request was sent to.
 *
 * Server actions get this check for free and route handlers do not, so the
 * streaming sync routes make it themselves: a cross-site page must not be
 * able to start a sync on a signed-in user's behalf.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
