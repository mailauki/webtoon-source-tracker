import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the server/client boundary, which types do not model.
 *
 * Two shapes, both of which compile and lint cleanly and then throw in the
 * browser, so the source is walked for them instead:
 *
 *   - Passing a function from a Server Component to a Client Component
 *     ("Functions cannot be passed directly to Client Components").
 *   - Calling a plain function that a "use client" module exports from a
 *     Server Component ("Attempted to call progressLabel() from the server
 *     but progressLabel is on the client"). A client module's non-component
 *     exports are not callable across the boundary — only rendered as
 *     components or passed as props — so shared helpers belong in `lib/`.
 */

const ROOTS = ["app", "components"];

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

const isClient = (src: string) => /^\s*["']use client["']/m.test(src);

/** Components imported by a file, mapped to the path they came from. */
function importedComponents(src: string, from: string) {
  const found = new Map<string, string>();
  const importRe = /import\s+\{([^}]+)\}\s+from\s+["'](@\/[^"']+)["']/g;

  for (const [, names, spec] of src.matchAll(importRe)) {
    const path = spec.replace(/^@\//, "");
    for (const raw of names.split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      // Components are the PascalCase imports; hooks and helpers are not.
      if (name && /^[A-Z]/.test(name)) found.set(name, path);
    }
  }
  found.delete(from);
  return found;
}

/**
 * The non-component values a file imports, mapped to where they came from.
 *
 * The inverse of importedComponents: camelCase and SCREAMING_CASE imports are
 * the helpers and constants, where PascalCase ones are components. A type-only
 * import is erased at build time and crosses the boundary harmlessly, so
 * `import type` and inline `type` specifiers are skipped.
 */
function importedValues(src: string, from: string) {
  const found = new Map<string, string>();
  const importRe = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["'](@\/[^"']+)["']/g;

  for (const [, typeOnly, names, spec] of src.matchAll(importRe)) {
    if (typeOnly) continue;
    const path = spec.replace(/^@\//, "");
    for (const raw of names.split(",")) {
      const specifier = raw.trim();
      if (/^type\s/.test(specifier)) continue;
      const name = specifier.split(/\s+as\s+/).pop()?.trim();
      if (name && !/^[A-Z][a-z]/.test(name)) found.set(name, path);
    }
  }
  found.delete(from);
  return found;
}

/**
 * JSX props whose value is a function expression: `prop={(x) => ...}`,
 * `prop={function ...}`, or a bare identifier that is a local function.
 */
function functionProps(src: string, tag: string): string[] {
  const open = new RegExp(`<${tag}\\b[\\s\\S]*?/?>`, "g");
  const bad: string[] = [];

  for (const [element] of [...src.matchAll(open)].map((m) => [m[0]])) {
    for (const [, prop] of element.matchAll(
      /(\w+)=\{\s*(?:\([^)]*\)\s*=>|function\b|async\s)/g,
    )) {
      bad.push(prop);
    }
  }
  return bad;
}

describe("server/client boundary", () => {
  it("passes no function props from a Server Component to a Client Component", async () => {
    const files = (await Promise.all(ROOTS.map(sourceFiles))).flat();

    const clientComponents = new Set(
      files.filter((f) => isClient(readFileSync(f, "utf8"))),
    );

    const violations: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (isClient(src)) continue; // client -> client is fine

      for (const [name, path] of importedComponents(src, file)) {
        const target = files.find(
          (f) => f === `${path}.tsx` || f === `${path}/index.tsx`,
        );
        if (!target || !clientComponents.has(target)) continue;

        for (const prop of functionProps(src, name)) {
          violations.push(`${file}: <${name} ${prop}={...}> -> ${target}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  /**
   * The bug this caught: `progressLabel` and `STATUS_LABELS` lived on
   * components/entry-card.tsx, which is "use client". The entry page's header
   * is server-rendered and imported them, which crashed at render. They moved
   * to lib/data/entry-labels.ts, which has no boundary.
   */
  it("calls no client-module helper from a Server Component", async () => {
    const files = (await Promise.all(ROOTS.map(sourceFiles))).flat();

    const clientModules = new Set(
      files.filter((f) => isClient(readFileSync(f, "utf8"))),
    );

    const violations: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (isClient(src)) continue; // client -> client is fine

      for (const [name, path] of importedValues(src, file)) {
        const target = files.find(
          (f) => f === `${path}.tsx` || f === `${path}/index.tsx`,
        );
        if (!target || !clientModules.has(target)) continue;

        violations.push(`${file}: imports ${name} from client ${target}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
