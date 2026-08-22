import { ImageResponse } from "next/og";

import { COVERS } from "@/lib/og/covers";

/**
 * The social card for every route that does not override it.
 *
 * ---------------------------------------------------------------------------
 * Crop safety
 * ---------------------------------------------------------------------------
 * Consumers do not all honour 1.91:1. Twitter, WhatsApp, Discord and various
 * feeds center-crop toward squarer ratios, and a 1:1 crop of a 1200x630 image
 * keeps only the middle 630px — it discards 285px from EACH side.
 *
 * So the layout is built around a safe zone rather than a left column:
 *
 *   0        285                          915       1200
 *   |  bleed  |         SAFE (630)         |  bleed  |
 *   |  covers |  wordmark, headline, sub   |  covers |
 *
 * Everything that must survive — the wordmark, the headline, the subhead —
 * lives inside the centre 630px and is centred within it. The cover art sits
 * in the bleed zones on both sides, where losing it costs nothing: at 1.91:1
 * it frames the message, and at 1:1 it is simply gone.
 *
 * The headline is also split onto explicit lines rather than left to wrap,
 * because a wrap point that shifts with the font metrics is a wrap point that
 * can push a word out of the safe zone.
 *
 * ---------------------------------------------------------------------------
 * Satori constraints
 * ---------------------------------------------------------------------------
 *   - Flexbox subset only, and `display: flex` is NOT inherited from the
 *     browser default, so every container sets it explicitly.
 *   - No CSS custom properties. Colors are literal hex; a `var(--brand)`
 *     renders transparent rather than failing loudly.
 *
 * Cover art is embedded as data URIs (lib/og/covers.ts) so rendering never
 * depends on MAL's CDN. Regenerate with
 * `node --experimental-strip-types scripts/gen-og-covers.ts`.
 */
export const alt =
  "Webtoon Source Tracker — track which app or site you read each manga and webtoon on";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = "#f6b606";
const BACKGROUND = "#121212";
const FOREGROUND = "#ffffff";
const MUTED = "#a1a1a1";

/** The centre region guaranteed to survive a 1:1 crop. */
const SAFE_WIDTH = 630;

/**
 * One bleed column of cover art.
 *
 * Tilted and overscaled so it reads as a wall of covers running past the
 * frame. Purely decorative: every pixel here is outside the safe zone.
 */
function CoverColumn({
  side,
  covers,
}: {
  side: "left" | "right";
  covers: { title: string; src: string }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: -70,
        [side]: -60,
        width: 400,
        height: 770,
        flexDirection: "column",
        gap: 16,
        transform: `rotate(${side === "left" ? -8 : 8}deg)`,
      }}
    >
      {[0, 1].map((row) => (
        <div key={row} style={{ display: "flex", gap: 16 }}>
          {covers.slice(row * 2, row * 2 + 2).map((cover) => (
            <div
              key={cover.title}
              style={{
                display: "flex",
                width: 186,
                height: 262,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <img src={cover.src} width={186} height={262} alt="" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BACKGROUND,
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Decorative bleed. Discarded by a square crop, by design. */}
        <CoverColumn side="left" covers={COVERS.slice(0, 4)} />
        <CoverColumn side="right" covers={COVERS.slice(4, 8)} />

        {/* Scrim: darkens the covers so the centred text keeps its contrast
            no matter which cover happens to sit behind the edge of it. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            background:
              "linear-gradient(90deg, rgba(18,18,18,0.10) 0%, rgba(18,18,18,0.62) 12%, rgba(18,18,18,0.95) 25%, rgba(18,18,18,0.95) 75%, rgba(18,18,18,0.62) 88%, rgba(18,18,18,0.10) 100%)",
          }}
        />

        {/* ---------------- Safe zone ---------------- */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: SAFE_WIDTH,
            height: 630,
            textAlign: "center",
          }}
        >
          <div
            style={{ display: "flex", width: 76, height: 7, background: BRAND }}
          />

          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            <span style={{ color: FOREGROUND }}>Source</span>
            <span style={{ color: BRAND }}>Tracker</span>
          </div>

          {/* Explicit lines — never left to wrap. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 22,
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.16,
            }}
          >
            <span style={{ color: MUTED }}>MyAnimeList knows</span>
            <span style={{ color: MUTED }}>what you read.</span>
            <div style={{ display: "flex", color: FOREGROUND }}>
              <span>This knows&nbsp;</span>
              <span style={{ color: BRAND }}>where</span>
              <span>.</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 24,
              maxWidth: 500,
              fontSize: 23,
              color: MUTED,
              lineHeight: 1.45,
            }}
          >
            The app or site behind every chapter — not just how far you got.
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 30,
              fontSize: 19,
              color: MUTED,
            }}
          >
            <span>WEBTOON</span>
            <span style={{ color: "#454545" }}>·</span>
            <span>Tapas</span>
            <span style={{ color: "#454545" }}>·</span>
            <span>MANGA Plus</span>
            <span style={{ color: "#454545" }}>·</span>
            <span>Physical</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
