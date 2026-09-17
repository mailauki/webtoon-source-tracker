import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // MyAnimeList cover art.
    //
    // Covers currently render with `unoptimized` and so never reach the
    // optimizer — see components/cover-image.tsx for why. This stays because
    // it is what the optimizer checks against: without the host listed, every
    // cover 400s the moment that prop comes off again.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.myanimelist.net",
        pathname: "/images/**",
      },
    ],
  },
};

export default nextConfig;
