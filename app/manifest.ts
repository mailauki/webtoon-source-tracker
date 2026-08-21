import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * This is what makes the app installable — per Next's PWA guide the only
 * requirements are a valid manifest and HTTPS, so there is deliberately no
 * service worker here. Everything still needs the network, exactly as before;
 * installing just gives it a home-screen icon and its own window.
 *
 * Colors are the resolved values of the tokens in globals.css. The manifest
 * spec takes plain CSS colors, so `--background: oklch(1 0 0)` is written as
 * its hex equivalent. Keep these in sync if the palette changes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Webtoon Source Tracker",
    // Home screens truncate aggressively; this is what sits under the icon.
    short_name: "WST",
    description: "Track which app or site you read each manga and webtoon on.",

    // Open straight into the library rather than "/", which only redirects.
    start_url: "/library",
    // Constrain the installed app to its own pages, so following an external
    // link opens the browser instead of stranding it in a chromeless window.
    scope: "/",
    display: "standalone",

    // Shown behind the splash screen while the app boots. This is the light
    // surface (--background) — the manifest has no dark variant, and a light
    // splash reads as intentional on both themes where amber is the constant.
    background_color: "#ffffff",
    // Tints the Android status bar. Brand amber (--brand), identical in both
    // themes by design.
    theme_color: "#f6b606",

    orientation: "portrait",
    categories: ["books", "productivity"],

    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // `maskable` lets Android crop to whatever shape the launcher uses
      // (circle, squircle, rounded square) without letterboxing. The mark sits
      // well inside the safe zone, so the same asset serves both purposes.
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
