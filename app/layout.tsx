import type { Metadata, Viewport } from "next";
import { Geist, Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    // Pages set a bare title ("Library"); the template appends the suffix, so
    // nothing below should spell out the product name itself.
    template: "%s · Webtoon Source Tracker",
    default: "Webtoon Source Tracker",
  },
  description: "Track which app or site you read each manga and webtoon on.",
  icons: {
    icon: [
      "/wst-logo.png",
      { url: "/wst-logo-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
    // Android home-screen icons, picked by the launcher from these sizes.
    // The dark entries must point at the *-dark files — pointing them at the
    // light ones renders a valid-looking tag that quietly serves black-on-amber
    // in dark mode.
    shortcut: [
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      {
        url: "/android-chrome-192x192-dark.png",
        sizes: "192x192",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/android-chrome-512x512-dark.png",
        sizes: "512x512",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    // No bare fallback string here: it would emit a fourth, media-less tag that
    // always matches, competing with the light entry below.
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/apple-touch-icon-dark.png",
        sizes: "180x180",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

/**
 * Tints the browser/status-bar chrome around the app.
 *
 * Unlike the manifest's single `theme_color`, this one can follow the active
 * theme, so the chrome matches the page surface instead of floating above it.
 * `viewportFit: "cover"` lets the layout reach into the safe areas on notched
 * phones, which matters once the app is installed and running fullscreen.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // suppressHydrationWarning is required: next-themes sets the theme class on
  // <html> before React hydrates, which React would otherwise flag as a
  // mismatch.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
