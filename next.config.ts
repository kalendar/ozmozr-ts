import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and dynamic, so the static-shell caching model is off.
  serverExternalPackages: ["pg", "pg-boss", "sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
