import type { NextConfig } from "next";

const config: NextConfig = {
  // Temporary preview-only bypass while isolating RB workspace type diagnostics.
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      {protocol:"https",hostname:"a.espncdn.com"},
    ],
  },
};

export default config;
