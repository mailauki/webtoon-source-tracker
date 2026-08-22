/**
 * Downloads the demo covers and emits them as data URIs.
 * Run manually when the featured titles change; output is committed.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The six titles the card shows, in display order. `.webp` paths are requested
// as `.jpg` — MAL serves both, and Satori cannot decode webp.
// Ten of the twelve seeded titles, so the card's two rows never repeat a
// cover. Order here is the order they appear, left to right, top row first.
const COVERS: { title: string; url: string }[] = [
  { title: "Solo Leveling", url: "https://cdn.myanimelist.net/images/manga/3/222295l.jpg" },
  { title: "Omniscient Reader's Viewpoint", url: "https://cdn.myanimelist.net/images/manga/2/238873l.jpg" },
  { title: "Tower of God", url: "https://cdn.myanimelist.net/images/manga/2/223694l.jpg" },
  { title: "One Piece", url: "https://cdn.myanimelist.net/images/manga/2/253146l.jpg" },
  { title: "Chainsaw Man", url: "https://cdn.myanimelist.net/images/manga/3/216464l.jpg" },
  { title: "Jujutsu Kaisen", url: "https://cdn.myanimelist.net/images/manga/3/210341l.jpg" },
  { title: "The God of High School", url: "https://cdn.myanimelist.net/images/manga/1/205814l.jpg" },
  { title: "Noblesse", url: "https://cdn.myanimelist.net/images/manga/2/266261l.jpg" },
  { title: "Shingeki no Kyojin", url: "https://cdn.myanimelist.net/images/manga/2/37846l.jpg" },
  { title: "Kaijuu 8-gou", url: "https://cdn.myanimelist.net/images/manga/3/252929l.jpg" },
];

// The card draws each cover about 150px wide; 300px keeps it crisp at 2x
// without carrying a full-size scan into the bundle.
const TARGET_WIDTH = 300;
const dir = mkdtempSync(join(tmpdir(), "og-covers-"));

const out: string[] = [];
for (const c of COVERS) {
  const r = await fetch(c.url);
  if (!r.ok) throw new Error(`${c.title}: HTTP ${r.status}`);
  const type = r.headers.get("content-type") ?? "";
  if (!type.includes("jpeg") && !type.includes("png")) throw new Error(`${c.title}: ${type}`);

  const file = join(dir, `${Buffer.from(c.title).toString("hex").slice(0, 12)}.jpg`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  // sips ships with macOS; --resampleWidth preserves aspect ratio.
  execFileSync("sips", ["--resampleWidth", String(TARGET_WIDTH), "-s", "formatOptions", "70", file], { stdio: "ignore" });

  const b64 = readFileSync(file).toString("base64");
  out.push(`  {\n    title: ${JSON.stringify(c.title)},\n    src: "data:image/jpeg;base64,${b64}",\n  },`);
  console.error(`ok ${c.title} (${Math.round(b64.length / 1024)}KB b64)`);
}

writeFileSync("lib/og/covers.ts", `// GENERATED FILE — do not edit by hand.
//
// Cover art for the social card, embedded as data URIs so the image renders
// without a runtime fetch to MAL's CDN. Regenerate with scripts/gen-og-covers.ts
// when the featured titles change.
//
// These are MAL's own cover images, used to depict the app's real UI.

export const COVERS: { title: string; src: string }[] = [
${out.join("\n")}
];
`);
console.error("wrote lib/og/covers.ts");
