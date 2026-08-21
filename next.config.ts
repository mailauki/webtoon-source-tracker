import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // MyAnimeList cover art. next/image refuses any host not listed here,
        // so without this every cover 400s at runtime.
        protocol: "https",
        hostname: "cdn.myanimelist.net",
        pathname: "/images/**",
      },
    ],
  },
};

export default nextConfig;
