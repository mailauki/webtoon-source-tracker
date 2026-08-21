import type { Metadata } from "next";
import { Geist, Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
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
    icon: "/wst-logo.png",
    // Android home-screen icons, picked by the launcher from these sizes.
    shortcut: [
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
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
        </ThemeProvider>
      </body>
    </html>
  );
}
