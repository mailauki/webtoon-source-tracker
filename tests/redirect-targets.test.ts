import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every internal redirect must point at a route that exists.
 *
 * The sign-in page lives at /auth/login. Two redirects pointed at a bare
 * /login, which has never been a route: clear-session (the page the DAL
 * sends a rejected session to) and the provider sign-in failure path. Both
 * 404'd, and clear-session's 404 stranded exactly the person whose session
 * had just been cleared.
 *
 * Asserted against the source rather than by rendering, because these fire
 * on redirect paths a unit test cannot reach — a wrong string is invisible
 * until someone hits the failure in a browser.
 */

const read = (path: string) => readFileSync(path, "utf8");

/** Internal redirect targets, as written in the source. */
function redirectTargets(source: string): string[] {
  return [
    ...source.matchAll(/(?:redirect\(|new URL\()\s*[`"']([^`"'$]*)/g),
  ]
    .map((match) => match[1])
    .filter((target) => target.startsWith("/"));
}

describe("redirect targets", () => {
  it("the sign-in page is /auth/login, and /login is not a route", () => {
    expect(existsSync("app/auth/login/page.tsx")).toBe(true);
    expect(existsSync("app/login/page.tsx")).toBe(false);
  });

  it.each([
    "app/auth/(auth)/clear-session/route.ts",
    "app/auth/(auth)/callback/route.ts",
    "app/auth/(auth)/logout/route.ts",
    "app/actions/auth.ts",
    "app/actions/identities.ts",
  ])("%s never redirects to a bare /login", (file) => {
    for (const target of redirectTargets(read(file))) {
      expect(target.startsWith("/login")).toBe(false);
    }
  });

  it("clear-session lands on the sign-in page, with the marker proxy.ts reads", () => {
    const target = read("app/auth/(auth)/clear-session/route.ts").match(
      /new URL\("([^"]+)"/,
    )?.[1];

    expect(target).toMatch(/^\/auth\/login/);
    // Without this, proxy.ts sees the (already deleted) cookie as a signed-in
    // visitor and bounces them back to /library — a loop.
    expect(target).toContain("signedout=1");
  });
});
