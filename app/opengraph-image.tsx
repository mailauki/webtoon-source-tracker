import { ImageResponse } from "next/og";

/**
 * The social card for every route that does not override it.
 *
 * Generated rather than a static file so the wording stays in source control
 * next to the metadata it mirrors, and so the brand tokens below can be kept
 * in step with globals.css by hand rather than by re-exporting a PNG.
 *
 * Colors are literal hex, not `var(--brand)`: Satori resolves no custom
 * properties, and an unresolved var renders as transparent rather than
 * failing loudly.
 */
export const alt =
  "Webtoon Source Tracker — track which app or site you read each manga and webtoon on";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = "#f6b606";
const BACKGROUND = "#121212";
const FOREGROUND = "#ffffff";
const MUTED = "#a1a1a1";

export default async function Image() {
  return new ImageResponse(
    (
      // Satori supports a flexbox subset only: every container below sets
      // display:flex explicitly, since it does not inherit the browser default.
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BACKGROUND,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Amber rule, echoing the brand accent in the wordmark. */}
        <div style={{ display: "flex", width: 96, height: 8, background: BRAND }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 700,
              color: FOREGROUND,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            <span>Source</span>
            <span style={{ color: BRAND }}>Tracker</span>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 36,
              color: MUTED,
              lineHeight: 1.35,
              maxWidth: 900,
            }}
          >
            MyAnimeList knows what you read. This knows where.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontSize: 26,
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
    ),
    size,
  );
}
