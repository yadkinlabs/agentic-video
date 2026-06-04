import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Required for Prisma v7 adapter-pg in edge-compatible environments
  },
};

export default nextConfig;
