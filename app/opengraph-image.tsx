import { ImageResponse } from "next/og";

import { COVERS } from "@/lib/og/covers";

/**
 * The social card for every route that does not override it.
 *
 * A product shot rather than a title slide: the copy carries the pitch on the
 * left, and an angled browser window on the right shows the real library grid,
 * so the card reads as software at thumbnail size.
 *
 * Generated rather than a static PNG so the wording stays in source control
 * next to the metadata it mirrors.
 *
 * Two Satori constraints shape the code below:
 *   - It supports a flexbox subset only, and does NOT inherit the browser
 *     default `display: flex`, so every container sets it explicitly.
 *   - It resolves no CSS custom properties. Colors are literal hex; a
 *     `var(--brand)` would render transparent rather than fail loudly.
 *
 * Cover art is embedded as data URIs (lib/og/covers.ts) so rendering never
 * depends on MAL's CDN being reachable. Regenerate with
 * `node --experimental-strip-types scripts/gen-og-covers.ts`.
 */
export const alt =
  "Webtoon Source Tracker — track which app or site you read each manga and webtoon on";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = "#f6b606";
const BACKGROUND = "#121212";
const SURFACE = "#1c1c1c";
const BORDER = "#2e2e2e";
const FOREGROUND = "#ffffff";
const MUTED = "#a1a1a1";

/**
 * Source pills under each cover, mirroring the real card badges — and taken
 * from what each of these titles is actually assigned in scripts/seed-demo.ts,
 * so the mock does not claim a platform the app never recorded.
 */
const SOURCES = [
  // Row one
  "Tappytoon",
  "WEBTOON",
  "WEBTOON",
  "MANGA Plus",
  "MANGA Plus",
  // Row two
  "MANGA Plus",
  "WEBTOON",
  "Tapas",
  "Physical",
  "MANGA Plus",
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BACKGROUND,
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        {/* ---------------- Left: the pitch ---------------- */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 556,
            flexShrink: 0,
            padding: "64px 0 64px 68px",
          }}
        >
          <div style={{ display: "flex", width: 88, height: 8, background: BRAND }} />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 50,
                fontWeight: 700,
                color: FOREGROUND,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              <span style={{ color: MUTED }}>MyAnimeList knows</span>
              <span>what you read.</span>
              <div style={{ display: "flex" }}>
                <span>This knows&nbsp;</span>
                <span style={{ color: BRAND }}>where</span>
                <span>.</span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 26,
                fontSize: 25,
                color: MUTED,
                lineHeight: 1.4,
                maxWidth: 430,
              }}
            >
              Track the app or site behind every chapter — not just how far you
              got.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 21,
              color: MUTED,
            }}
          >
            <span>WEBTOON</span>
            <span style={{ color: "#3f3f3f" }}>·</span>
            <span>Tapas</span>
            <span style={{ color: "#3f3f3f" }}>·</span>
            <span>MANGA Plus</span>
            <span style={{ color: "#3f3f3f" }}>·</span>
            <span>Physical</span>
          </div>
        </div>

        {/* ---------------- Right: the app ----------------
            Rotated and oversized so it bleeds off the right and bottom edges,
            which reads as a window onto a larger screen rather than a shrunken
            screenshot. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 62,
            left: 592,
            width: 830,
            height: 545,
            transform: "rotate(-8deg)",
            borderRadius: 16,
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Browser chrome */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              height: 44,
              flexShrink: 0,
              padding: "0 18px",
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <div style={{ display: "flex", width: 11, height: 11, borderRadius: 6, background: "#3f3f3f" }} />
            <div style={{ display: "flex", width: 11, height: 11, borderRadius: 6, background: "#3f3f3f" }} />
            <div style={{ display: "flex", width: 11, height: 11, borderRadius: 6, background: "#3f3f3f" }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginLeft: 14,
                padding: "0 14px",
                height: 24,
                borderRadius: 12,
                background: "#262626",
                fontSize: 12,
                color: MUTED,
              }}
            >
              webtoon-source-tracker
            </div>
          </div>

          {/* Library header + status chips */}
          <div style={{ display: "flex", flexDirection: "column", padding: "20px 22px 0" }}>
            <div
              style={{
                display: "flex",
                fontSize: 25,
                fontWeight: 700,
                color: FOREGROUND,
                letterSpacing: "-0.02em",
              }}
            >
              Library
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {["All", "Reading", "Completed", "On hold"].map((chip, i) => (
                <div
                  key={chip}
                  style={{
                    display: "flex",
                    padding: "5px 13px",
                    borderRadius: 20,
                    fontSize: 13,
                    background: i === 0 ? BRAND : "transparent",
                    color: i === 0 ? "#060616" : MUTED,
                    border: i === 0 ? "none" : `1px solid ${BORDER}`,
                    fontWeight: i === 0 ? 700 : 400,
                  }}
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>

          {/* Cover grid — the payoff. Each tile carries a source pill, which
              is the one thing this app shows that a reading list does not.
              Rendered twice: the second row is clipped by the window's bottom
              edge, so the grid reads as continuing rather than stopping. */}
          {[0, 1].map((row) => (
          <div key={row} style={{ display: "flex", gap: 12, padding: row === 0 ? "16px 22px 0" : "14px 22px 0" }}>
            {(row === 0 ? COVERS.slice(0, 5) : COVERS.slice(5)).map((cover, i) => (
              <div
                key={cover.title}
                style={{ display: "flex", flexDirection: "column", width: 124, flexShrink: 0 }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 124,
                    height: 175,
                    borderRadius: 9,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <img
                    src={cover.src}
                    width={124}
                    height={175}
                    style={{ objectFit: "cover" }}
                    alt=""
                  />
                  <div
                    style={{
                      display: "flex",
                      position: "absolute",
                      left: 6,
                      bottom: 6,
                      padding: "3px 8px",
                      borderRadius: 10,
                      background: "rgba(0,0,0,0.78)",
                      fontSize: 10,
                      color: FOREGROUND,
                    }}
                  >
                    {SOURCES[row * 5 + i]}
                  </div>
                </div>
                {/* Progress bar, echoing the real entry card. */}
                <div
                  style={{
                    display: "flex",
                    width: 124,
                    height: 3,
                    marginTop: 8,
                    background: "#2a2a2a",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: (row === 0
                        ? [124, 76, 104, 60, 90]
                        : [112, 48, 84, 124, 96])[i],
                      height: 3,
                      background: BRAND,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
